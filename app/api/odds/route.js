import { DEFAULT_REGIONS } from "../../../lib/default-data";

// ── Server-side cache ────────────────────────────────────
const CACHE_TTL_MS = 30_000; // 30 seconds

let cache = {
  data: null,
  timestamp: 0,
};

// ── Polymarket Live Odds ─────────────────────────────────
// Fetches current prices from the Gamma API using game slugs.
// Each game's `url` field contains the slug (last path segment).
const GAMMA_API = "https://gamma-api.polymarket.com";

function collectSlugs(regions) {
  const slugs = [];
  for (const regionData of Object.values(regions)) {
    for (const game of regionData.round1) {
      const slug = game.url?.split("/").pop();
      if (slug) slugs.push(slug);
    }
  }
  return slugs;
}

async function fetchPolymarketOdds(slugs) {
  // Fetch all markets in parallel, 4 at a time to be respectful
  const results = new Map();
  const batchSize = 8;
  for (let i = 0; i < slugs.length; i += batchSize) {
    const batch = slugs.slice(i, i + batchSize);
    const fetches = batch.map(async (slug) => {
      try {
        const res = await fetch(`${GAMMA_API}/markets?slug=${slug}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        const market = Array.isArray(data) ? data[0] : data;
        if (market?.outcomePrices && market?.outcomes) {
          results.set(slug, market);
        }
      } catch {
        // Skip failed fetches
      }
    });
    await Promise.all(fetches);
  }
  return results;
}

function applyPolymarketOdds(regions, marketData) {
  let updatedCount = 0;
  for (const regionData of Object.values(regions)) {
    for (const game of regionData.round1) {
      const slug = game.url?.split("/").pop();
      const market = slug && marketData.get(slug);
      if (!market?.outcomePrices) continue;

      try {
        const prices = JSON.parse(market.outcomePrices);
        const outcomes = typeof market.outcomes === "string"
          ? JSON.parse(market.outcomes)
          : (market.outcomes || []);
        if (prices.length < 2) continue;

        // Match outcomes to our top/bottom teams by name
        const topName = game.top.team.toLowerCase();
        const botName = game.bottom.team.toLowerCase();

        let topPrice = null;
        let botPrice = null;

        for (let i = 0; i < outcomes.length; i++) {
          const outcomeLower = outcomes[i].toLowerCase();
          if (outcomeLower.includes(topName) || topName.includes(outcomeLower.split(" ")[0])) {
            topPrice = parseFloat(prices[i]);
          } else if (outcomeLower.includes(botName) || botName.includes(outcomeLower.split(" ")[0])) {
            botPrice = parseFloat(prices[i]);
          }
        }

        // If name matching failed, check abbreviations or fall back to position
        if (topPrice == null && botPrice == null) {
          topPrice = parseFloat(prices[0]);
          botPrice = parseFloat(prices[1]);
        } else if (topPrice == null) {
          topPrice = 1 - botPrice;
        } else if (botPrice == null) {
          botPrice = 1 - topPrice;
        }

        game.topOdds = topPrice * 100;
        game.bottomOdds = botPrice * 100;
        updatedCount++;
      } catch {
        // Keep fallback odds
      }
    }
  }
  return updatedCount;
}

// ── ESPN Live Scores ─────────────────────────────────────
const ESPN_API = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";

async function fetchEspnScoresForDate(dateStr) {
  try {
    const res = await fetch(`${ESPN_API}?dates=${dateStr}`, {
      headers: { Accept: "application/json" }, cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.events || [];
  } catch {
    return [];
  }
}

async function fetchAllScores() {
  // Fetch scores from all tournament days (First Four through today)
  const today = new Date();
  const tournamentStart = new Date("2026-03-17");
  const dates = [];
  for (let d = new Date(tournamentStart); d <= today; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}${m}${day}`);
  }
  const results = await Promise.all(dates.map(fetchEspnScoresForDate));
  return results.flat();
}

function buildEspnIndex(events) {
  const index = new Map();
  for (const event of events) {
    const comps = event.competitions?.[0];
    if (!comps) continue;
    const teams = comps.competitors || [];
    for (const team of teams) {
      const name = team.team?.displayName?.toLowerCase();
      const shortName = team.team?.shortDisplayName?.toLowerCase();
      const abbr = team.team?.abbreviation?.toLowerCase();
      if (name) index.set(name, event);
      if (shortName) index.set(shortName, event);
      if (abbr) index.set(abbr, event);
    }
  }
  return index;
}

function namesMatch(a, b) {
  if (a.includes(b) || b.includes(a)) return true;
  const normalize = (s) => s.replace(/\./g, "").replace(/'/g, "'").trim();
  const an = normalize(a), bn = normalize(b);
  if (an.includes(bn) || bn.includes(an)) return true;
  const aFirst = an.split(" ")[0], bFirst = bn.split(" ")[0];
  if (aFirst.length >= 4 && aFirst === bFirst) return true;
  // Handle "SMU/Miami OH" style First Four names — try each part
  if (bn.includes("/")) {
    return bn.split("/").some((part) => namesMatch(a, part.trim()));
  }
  if (an.includes("/")) {
    return an.split("/").some((part) => namesMatch(part.trim(), b));
  }
  return false;
}

function matchEspnGame(game, espnIndex) {
  const topName = game.top.team.toLowerCase();
  const botName = game.bottom.team.toLowerCase();
  const topAbbr = game.top.abbr?.toLowerCase() || "";
  const botAbbr = game.bottom.abbr?.toLowerCase() || "";

  // Find ESPN event that has BOTH our teams (avoids ambiguity like "Miami" matching wrong game)
  let espnEvent = null;
  const allEvents = [...new Set(espnIndex.values())];
  for (const ev of allEvents) {
    const comps = ev.competitions?.[0];
    if (!comps) continue;
    const evTeams = comps.competitors || [];
    let hasTop = false, hasBot = false;
    for (const t of evTeams) {
      const tName = t.team?.displayName?.toLowerCase() || "";
      const tShort = t.team?.shortDisplayName?.toLowerCase() || "";
      const tAbbr = t.team?.abbreviation?.toLowerCase() || "";
      if (namesMatch(tName, topName) || namesMatch(tShort, topName) || tAbbr === topAbbr) hasTop = true;
      if (namesMatch(tName, botName) || namesMatch(tShort, botName) || tAbbr === botAbbr) hasBot = true;
    }
    if (hasTop && hasBot) { espnEvent = ev; break; }
  }
  // Fallback: single team match
  if (!espnEvent) {
    for (const [name, ev] of espnIndex) {
      if (namesMatch(name, topName) || namesMatch(name, botName) ||
          (topAbbr.length >= 2 && name === topAbbr) ||
          (botAbbr.length >= 2 && name === botAbbr)) {
        espnEvent = ev;
        break;
      }
    }
  }
  if (!espnEvent) return null;

  const comps = espnEvent.competitions?.[0];
  if (!comps) return null;
  const teams = comps.competitors || [];
  const statusType = espnEvent.status?.type?.name || "";
  const period = espnEvent.status?.period || 0;
  const clock = espnEvent.status?.displayClock || "";

  // Map ESPN status to our status format
  let status = "pre";
  if (statusType === "STATUS_FINAL") status = "final";
  else if (statusType === "STATUS_IN_PROGRESS" || statusType === "STATUS_HALFTIME") status = "live";

  // Find which ESPN team is our top/bottom
  let topScore = null, bottomScore = null;
  for (const t of teams) {
    const tName = t.team?.displayName?.toLowerCase() || "";
    const tShort = t.team?.shortDisplayName?.toLowerCase() || "";
    const tAbbr = t.team?.abbreviation?.toLowerCase() || "";
    const isTop = namesMatch(tName, topName) || namesMatch(tShort, topName) || tAbbr === topAbbr;
    const isBot = namesMatch(tName, botName) || namesMatch(tShort, botName) || tAbbr === botAbbr;
    if (isTop && topScore === null) topScore = t.score;
    else if (isBot && bottomScore === null) bottomScore = t.score;
  }
  // If one side matched but not the other, assign the remaining team
  if (topScore !== null && bottomScore === null) {
    for (const t of teams) {
      if (t.score !== topScore) { bottomScore = t.score; break; }
    }
  } else if (bottomScore !== null && topScore === null) {
    for (const t of teams) {
      if (t.score !== bottomScore) { topScore = t.score; break; }
    }
  }

  const periodLabel = statusType === "STATUS_HALFTIME" ? "HALFTIME"
    : period === 1 ? "1st" : period === 2 ? "2nd" : period > 2 ? `OT${period - 2}` : "";

  return {
    status,
    period: status === "final" ? "FINAL" : periodLabel,
    clock: status === "final" ? "" : clock,
    topScore, bottomScore,
    startTime: espnEvent.date || null,
  };
}

function applyLiveScores(regions, espnEvents) {
  const espnIndex = buildEspnIndex(espnEvents);
  let liveCount = 0;
  let finalCount = 0;

  for (const regionData of Object.values(regions)) {
    const games = regionData?.round1;
    if (!games) continue;

    for (const game of games) {
      const score = matchEspnGame(game, espnIndex);
      if (score && score.status !== "pre") {
        game.liveScore = score;
        if (score.status === "final") finalCount++;
        else liveCount++;
      }
    }
  }

  return { liveCount, finalCount };
}

// ── GET handler ──────────────────────────────────────────
export async function GET() {
  const now = Date.now();

  if (cache.data && now - cache.timestamp < CACHE_TTL_MS) {
    return Response.json({
      ...cache.data,
      cached: true,
      cacheAge: Math.round((now - cache.timestamp) / 1000),
      cacheTTL: Math.round(CACHE_TTL_MS / 1000),
    });
  }

  // Deep clone fallback data so we can mutate it
  const regions = JSON.parse(JSON.stringify(DEFAULT_REGIONS));

  // Fetch Polymarket odds and ESPN scores in parallel
  const slugs = collectSlugs(regions);
  const [marketData, espnEvents] = await Promise.all([
    fetchPolymarketOdds(slugs),
    fetchAllScores(),
  ]);

  // Apply live data
  const oddsUpdated = applyPolymarketOdds(regions, marketData);
  const { liveCount, finalCount } = espnEvents.length > 0
    ? applyLiveScores(regions, espnEvents)
    : { liveCount: 0, finalCount: 0 };

  const result = {
    regions,
    lastUpdated: new Date().toISOString(),
    liveGames: liveCount,
    finalGames: finalCount,
    oddsUpdated,
    oddsSource: oddsUpdated > 0 ? "polymarket-live" : "fallback",
  };

  cache = { data: result, timestamp: now };

  return Response.json({
    ...result,
    cached: false,
    cacheAge: 0,
    cacheTTL: Math.round(CACHE_TTL_MS / 1000),
  });
}
