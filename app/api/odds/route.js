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
  // Fetch all markets in parallel, 8 at a time to be respectful
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

// Cache past days' scores permanently (they won't change once final)
const pastDayScores = new Map();

async function fetchAllScores() {
  const today = new Date();
  const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const tournamentStart = new Date("2026-03-17");
  const tournamentEnd = new Date("2026-04-10"); // Championship + buffer
  const endDate = today < tournamentEnd ? today : tournamentEnd;
  const allEvents = [];

  const datesToFetch = [];
  for (let d = new Date(tournamentStart); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    if (dateStr !== todayStr && pastDayScores.has(dateStr)) {
      allEvents.push(...pastDayScores.get(dateStr));
    } else {
      datesToFetch.push(dateStr);
    }
  }

  if (datesToFetch.length > 0) {
    const results = await Promise.all(datesToFetch.map(fetchEspnScoresForDate));
    for (let i = 0; i < datesToFetch.length; i++) {
      const dateStr = datesToFetch[i];
      const events = results[i];
      // Only cache past days where all events are final (not live/scheduled)
      const allFinal = events.length > 0 && events.every((e) =>
        e.status?.type?.name === "STATUS_FINAL"
      );
      if (dateStr !== todayStr && allFinal) {
        pastDayScores.set(dateStr, events);
      }
      allEvents.push(...events);
    }
  }

  return allEvents;
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

function matchEspnGame(game, espnIndex, uniqueEvents) {
  const topName = game.top.team.toLowerCase();
  const botName = game.bottom.team.toLowerCase();
  const topAbbr = game.top.abbr?.toLowerCase() || "";
  const botAbbr = game.bottom.abbr?.toLowerCase() || "";

  // Find ESPN event that has BOTH our teams (avoids ambiguity like "Miami" matching wrong game)
  let espnEvent = null;
  const allEvents = uniqueEvents;
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
  let topMatchIdx = -1, botMatchIdx = -1;
  for (let ti = 0; ti < teams.length; ti++) {
    const t = teams[ti];
    const tName = t.team?.displayName?.toLowerCase() || "";
    const tShort = t.team?.shortDisplayName?.toLowerCase() || "";
    const tAbbr = t.team?.abbreviation?.toLowerCase() || "";
    const isTop = namesMatch(tName, topName) || namesMatch(tShort, topName) || tAbbr === topAbbr;
    const isBot = namesMatch(tName, botName) || namesMatch(tShort, botName) || tAbbr === botAbbr;
    if (isTop && topMatchIdx === -1) { topScore = t.score; topMatchIdx = ti; }
    else if (isBot && botMatchIdx === -1) { bottomScore = t.score; botMatchIdx = ti; }
  }
  // If one side matched but not the other, assign the remaining team by index
  if (topMatchIdx >= 0 && botMatchIdx === -1) {
    const other = teams.find((_, i) => i !== topMatchIdx);
    if (other) bottomScore = other.score;
  } else if (botMatchIdx >= 0 && topMatchIdx === -1) {
    const other = teams.find((_, i) => i !== botMatchIdx);
    if (other) topScore = other.score;
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
  const uniqueEvents = [...new Set(espnIndex.values())];
  let liveCount = 0;
  let finalCount = 0;

  for (const regionData of Object.values(regions)) {
    const games = regionData?.round1;
    if (!games) continue;

    for (const game of games) {
      const score = matchEspnGame(game, espnIndex, uniqueEvents);
      if (score && score.status !== "pre") {
        game.liveScore = score;
        if (score.status === "final") finalCount++;
        else liveCount++;
      }
    }
  }

  return { liveCount, finalCount };
}

// ── Build Later Rounds with Auto-discovered Odds ─────────
// Polymarket slug abbreviation map for common team names
const TEAM_SLUG_MAP = {
  "duke": "duke", "siena": "siena", "ohio state": "ohiost", "tcu": "tcu",
  "st. john's": "stjohn", "northern iowa": "niowa", "kansas": "kan", "ca baptist": "cabap",
  "louisville": "lou", "south florida": "sfl", "michigan st.": "mst", "n. dakota st.": "ndkst",
  "ucla": "ucla", "ucf": "ucf", "uconn": "uconn", "furman": "furman",
  "florida": "fl", "lehigh/pv a&m": "pvam", "clemson": "clmsn", "iowa": "iowa",
  "vanderbilt": "vand", "mcneese": "mcnst", "nebraska": "nebr", "troy": "troy",
  "north carolina": "ncar", "vcu": "vcu", "illinois": "ill", "penn": "penn",
  "saint mary's": "stmry", "texas a&m": "txam", "houston": "hou", "idaho": "idaho",
  "arizona": "arz", "long island": "liub", "villanova": "vill", "utah state": "utahst",
  "wisconsin": "wisc", "high point": "hpnt", "arkansas": "ark", "hawai'i": "hawaii",
  "byu": "byu", "texas": "tx", "gonzaga": "gnzg", "kennesaw st.": "kenest",
  "miami": "mia", "missouri": "missr", "purdue": "pur", "queens": "queen",
  "michigan": "mich", "howard": "how", "georgia": "ga", "saint louis": "stlou",
  "texas tech": "txtech", "akron": "akron", "alabama": "ala", "hofstra": "hofst",
  "tennessee": "tenn", "miami (oh)": "miaoh", "virginia": "vir", "wright st.": "wrght",
  "kentucky": "uk", "santa clara": "sanclr", "iowa state": "iowast", "tennessee st.": "tenst",
  // ESPN display names
  "prairie view a&m": "pvam", "texas longhorns": "tx",
  "miami hurricanes": "mia", "howard bison": "how",
};

function getTeamSlugAbbr(teamName) {
  const lower = teamName.toLowerCase();
  if (TEAM_SLUG_MAP[lower]) return TEAM_SLUG_MAP[lower];
  // Fallback: first word, lowercased, truncated
  return lower.split(" ")[0].replace(/[^a-z]/g, "").slice(0, 6);
}

function getWinnerFromGame(game) {
  if (!game.liveScore || game.liveScore.status !== "final") return null;
  const topScore = parseInt(game.liveScore.topScore) || 0;
  const botScore = parseInt(game.liveScore.bottomScore) || 0;
  if (topScore === botScore) return null;
  return topScore > botScore ? game.top : game.bottom;
}

function buildRound2Matchups(round1Games) {
  const matchups = [];
  for (let i = 0; i < round1Games.length; i += 2) {
    const g1 = round1Games[i];
    const g2 = round1Games[i + 1];
    if (!g1 || !g2) { matchups.push(null); continue; }
    const w1 = getWinnerFromGame(g1);
    const w2 = getWinnerFromGame(g2);
    if (w1 && w2) {
      matchups.push({ top: w1, bottom: w2, decided: true });
    } else if (w1) {
      matchups.push({ top: w1, bottom: null, decided: false });
    } else if (w2) {
      matchups.push({ top: null, bottom: w2, decided: false });
    } else {
      matchups.push(null);
    }
  }
  return matchups;
}

function generateRound2Slugs(round2Matchups, round) {
  const slugs = [];
  // Second round dates are typically 2 days after first round
  const dateGuesses = ["2026-03-21", "2026-03-22", "2026-03-23"];

  for (const matchup of round2Matchups) {
    if (!matchup?.decided) { slugs.push(null); continue; }
    const topAbbr = getTeamSlugAbbr(matchup.top.team);
    const botAbbr = getTeamSlugAbbr(matchup.bottom.team);
    // Try both orderings and multiple dates
    const candidates = [];
    for (const date of dateGuesses) {
      candidates.push(`cbb-${topAbbr}-${botAbbr}-${date}`);
      candidates.push(`cbb-${botAbbr}-${topAbbr}-${date}`);
    }
    slugs.push(candidates);
  }
  return slugs;
}

async function fetchRound2Odds(round2Matchups) {
  const slugCandidates = generateRound2Slugs(round2Matchups);
  const results = new Map(); // matchup index -> { market, slug }

  // Flatten all candidates for parallel fetching
  const allFetches = [];
  for (let i = 0; i < slugCandidates.length; i++) {
    if (!slugCandidates[i]) continue;
    for (const slug of slugCandidates[i]) {
      allFetches.push({ index: i, slug });
    }
  }

  // Fetch in batches
  const batchSize = 10;
  for (let i = 0; i < allFetches.length; i += batchSize) {
    const batch = allFetches.slice(i, i + batchSize);
    await Promise.all(batch.map(async ({ index, slug }) => {
      if (results.has(index)) return; // Already found for this matchup
      try {
        const res = await fetch(`${GAMMA_API}/markets?slug=${slug}`, {
          headers: { Accept: "application/json" }, cache: "no-store",
        });
        if (!res.ok) return;
        const text = await res.text();
        const data = JSON.parse(text.replace(/[\x00-\x1f]/g, ""));
        const market = Array.isArray(data) ? data[0] : data;
        if (market?.outcomePrices && market?.outcomes) {
          results.set(index, { market, slug });
        }
      } catch { /* skip */ }
    }));
  }

  return results;
}

function applyRound2Data(regions, round2OddsMap) {
  for (const regionData of Object.values(regions)) {
    const round2 = buildRound2Matchups(regionData.round1);
    regionData.round2 = round2.map((matchup, i) => {
      if (!matchup) return null;

      // Find odds for this matchup across all regions
      const regionIndex = Object.values(regions).indexOf(regionData);
      const globalIndex = regionIndex * 4 + i;
      const oddsData = round2OddsMap.get(globalIndex);

      if (oddsData && matchup.decided) {
        try {
          const { market, slug } = oddsData;
          const prices = JSON.parse(market.outcomePrices);
          const outcomes = typeof market.outcomes === "string"
            ? JSON.parse(market.outcomes) : (market.outcomes || []);

          const topName = matchup.top.team.toLowerCase();
          let topPrice = null, botPrice = null;

          for (let j = 0; j < outcomes.length; j++) {
            const ol = outcomes[j].toLowerCase();
            if (namesMatch(ol, topName)) topPrice = parseFloat(prices[j]);
            else botPrice = parseFloat(prices[j]);
          }
          if (topPrice == null && botPrice == null) {
            topPrice = parseFloat(prices[0]);
            botPrice = parseFloat(prices[1]);
          } else if (topPrice == null) topPrice = 1 - botPrice;
          else if (botPrice == null) botPrice = 1 - topPrice;

          matchup.topOdds = topPrice * 100;
          matchup.bottomOdds = botPrice * 100;
          matchup.url = `https://polymarket.com/sports/cbb/${slug}`;
        } catch { /* keep without odds */ }
      }

      return matchup;
    });
  }
}

// ── Team Logos from ESPN ─────────────────────────────────
function applyTeamLogos(regions, espnEvents) {
  // Build a map of team shortName → logo URL, keyed by exact short name
  const logoEntries = []; // { displayName, shortName, abbr, logoUrl }
  for (const event of espnEvents) {
    const comps = event.competitions?.[0];
    if (!comps) continue;
    for (const c of comps.competitors || []) {
      const logo = c.team?.logo;
      const id = c.team?.id;
      const logoUrl = logo || (id ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png` : null);
      if (logoUrl) {
        logoEntries.push({
          displayName: c.team?.displayName?.toLowerCase() || "",
          shortName: c.team?.shortDisplayName?.toLowerCase() || "",
          abbr: c.team?.abbreviation?.toLowerCase() || "",
          logoUrl,
        });
      }
    }
  }

  for (const regionData of Object.values(regions)) {
    for (const game of regionData.round1) {
      for (const side of [game.top, game.bottom]) {
        const name = side.team.toLowerCase();
        const abbr = side.abbr?.toLowerCase() || "";
        // 1. Try exact short name match first
        let match = logoEntries.find((e) => e.shortName === name);
        // 2. Try abbreviation match
        if (!match && abbr) match = logoEntries.find((e) => e.abbr === abbr);
        // 3. Try exact display name contains
        if (!match) match = logoEntries.find((e) => e.displayName.startsWith(name + " ") || e.displayName === name);
        // 4. Fallback to namesMatch (but skip ambiguous short names)
        if (!match) {
          match = logoEntries.find((e) =>
            e.shortName.length > 4 && namesMatch(e.shortName, name)
          );
        }
        if (match) side.logo = match.logoUrl;
      }
    }
  }
}

// ── Championship Futures from Polymarket ─────────────────
const FUTURES_CACHE = { data: null, timestamp: 0 };
const FUTURES_TTL_MS = 300_000; // 5 minutes

async function fetchChampionshipFutures() {
  const now = Date.now();
  if (FUTURES_CACHE.data && now - FUTURES_CACHE.timestamp < FUTURES_TTL_MS) {
    return FUTURES_CACHE.data;
  }

  try {
    const res = await fetch(
      "https://gamma-api.polymarket.com/events?slug=2026-ncaa-tournament-winner",
      { headers: { Accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const event = Array.isArray(data) ? data[0] : data;
    if (!event?.markets) return [];

    const futures = event.markets
      .filter((m) => {
        const prices = m.outcomePrices ? JSON.parse(m.outcomePrices) : [];
        return prices.length >= 2 && parseFloat(prices[0]) > 0.005;
      })
      .map((m) => {
        const prices = JSON.parse(m.outcomePrices);
        return {
          team: m.groupItemTitle || "Unknown",
          odds: Math.round(parseFloat(prices[0]) * 1000) / 10,
          volume: m.volume ? Math.round(parseFloat(m.volume)) : 0,
          slug: m.slug,
        };
      })
      .sort((a, b) => b.odds - a.odds)
      .slice(0, 16);

    FUTURES_CACHE.data = futures;
    FUTURES_CACHE.timestamp = now;
    return futures;
  } catch {
    return FUTURES_CACHE.data || [];
  }
}

// ── Next Game Countdown ──────────────────────────────────
function findNextGame(espnEvents) {
  const now = new Date();
  let nextGame = null;
  let nextTime = Infinity;

  for (const event of espnEvents) {
    const status = event.status?.type?.name;
    if (status !== "STATUS_SCHEDULED") continue;
    const gameTime = new Date(event.date);
    if (gameTime > now && gameTime.getTime() < nextTime) {
      nextTime = gameTime.getTime();
      const comps = event.competitions?.[0];
      const teams = comps?.competitors || [];
      nextGame = {
        time: event.date,
        teams: teams.map((t) => t.team?.shortDisplayName || t.team?.displayName || "TBD").join(" vs "),
      };
    }
  }
  return nextGame;
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

  // Fetch Polymarket odds, ESPN scores, and championship futures in parallel
  const slugs = collectSlugs(regions);
  const [marketData, espnEvents, futures] = await Promise.all([
    fetchPolymarketOdds(slugs),
    fetchAllScores(),
    fetchChampionshipFutures(),
  ]);

  // Apply live data
  const oddsUpdated = applyPolymarketOdds(regions, marketData);
  const { liveCount, finalCount } = espnEvents.length > 0
    ? applyLiveScores(regions, espnEvents)
    : { liveCount: 0, finalCount: 0 };

  // Apply team logos from ESPN data
  if (espnEvents.length > 0) {
    applyTeamLogos(regions, espnEvents);
  }

  // Build round 2 matchups and fetch their odds
  const allRound2 = [];
  for (const regionData of Object.values(regions)) {
    const r2 = buildRound2Matchups(regionData.round1);
    allRound2.push(...r2);
  }
  const round2OddsMap = await fetchRound2Odds(allRound2);
  applyRound2Data(regions, round2OddsMap);

  // Find next scheduled game
  const nextGame = findNextGame(espnEvents);

  const result = {
    regions,
    lastUpdated: new Date().toISOString(),
    liveGames: liveCount,
    finalGames: finalCount,
    oddsUpdated,
    oddsSource: oddsUpdated > 0 ? "polymarket-live" : "fallback",
    futures,
    nextGame,
  };

  cache = { data: result, timestamp: now };

  return Response.json({
    ...result,
    cached: false,
    cacheAge: 0,
    cacheTTL: Math.round(CACHE_TTL_MS / 1000),
  });
}
