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

function parseMarketOdds(market, topTeamName) {
  const prices = JSON.parse(market.outcomePrices);
  const outcomes = typeof market.outcomes === "string"
    ? JSON.parse(market.outcomes) : (market.outcomes || []);
  if (prices.length < 2) return null;

  const topName = topTeamName.toLowerCase();
  let topPrice = null, botPrice = null;

  for (let i = 0; i < outcomes.length; i++) {
    const ol = outcomes[i].toLowerCase();
    if (namesMatch(ol, topName)) topPrice = parseFloat(prices[i]);
    else if (botPrice == null) botPrice = parseFloat(prices[i]);
  }

  if (topPrice == null && botPrice == null) {
    topPrice = parseFloat(prices[0]);
    botPrice = parseFloat(prices[1]);
  } else if (topPrice == null) topPrice = 1 - botPrice;
  else if (botPrice == null) botPrice = 1 - topPrice;

  return { topOdds: topPrice * 100, bottomOdds: botPrice * 100 };
}

function applyPolymarketOdds(regions, marketData) {
  let updatedCount = 0;
  for (const regionData of Object.values(regions)) {
    for (const game of regionData.round1) {
      const slug = game.url?.split("/").pop();
      const market = slug && marketData.get(slug);
      if (!market?.outcomePrices) continue;
      try {
        const odds = parseMarketOdds(market, game.top.team);
        if (odds) {
          game.topOdds = odds.topOdds;
          game.bottomOdds = odds.bottomOdds;
          updatedCount++;
        }
      } catch { /* keep fallback */ }
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

function formatDateESPN(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

async function fetchAllScores() {
  const today = new Date();
  const todayStr = formatDateESPN(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDateESPN(tomorrow);
  // Use local dates (not UTC strings) to avoid off-by-one from timezone mismatch
  const tournamentStart = new Date(2026, 2, 17); // March 17, 2026 local midnight
  const tournamentEnd = new Date(2026, 3, 10);   // April 10, 2026 local midnight
  const endDate = today < tournamentEnd ? today : tournamentEnd;
  const allEvents = [];

  const datesToFetch = [];
  // Include tournament dates from start to today
  for (let d = new Date(tournamentStart); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = formatDateESPN(d);
    if (dateStr !== todayStr && dateStr !== tomorrowStr && pastDayScores.has(dateStr)) {
      allEvents.push(...pastDayScores.get(dateStr));
    } else {
      datesToFetch.push(dateStr);
    }
  }
  // Also include tomorrow for schedule
  if (!datesToFetch.includes(tomorrowStr)) {
    datesToFetch.push(tomorrowStr);
  }
  // Include upcoming round dates (up to 7 days ahead) for schedule display
  const lookAhead = new Date(today);
  lookAhead.setDate(lookAhead.getDate() + 7);
  const lookAheadEnd = lookAhead < tournamentEnd ? lookAhead : tournamentEnd;
  for (let d = new Date(tomorrow); d <= lookAheadEnd; d.setDate(d.getDate() + 1)) {
    const dateStr = formatDateESPN(d);
    if (!datesToFetch.includes(dateStr)) {
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
      if (dateStr !== todayStr && dateStr !== tomorrowStr && allFinal) {
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
  if (a === b) return true;
  const normalize = (s) => s.replace(/\./g, "").replace(/'/g, "'").trim();
  const an = normalize(a), bn = normalize(b);
  if (an === bn) return true;

  // Substring match with "St"/"State" guard:
  // "tennessee" should NOT match "tennessee st" (different schools)
  function substringOk(container, sub) {
    if (!container.includes(sub)) return false;
    // If the substring is at the start and the next word is "st"/"state"/"a&m", reject
    if (container.startsWith(sub)) {
      const rest = container.slice(sub.length).trim();
      if (/^(st\b|state\b|a&m\b)/i.test(rest)) return false;
    }
    return true;
  }

  if (substringOk(an, bn) || substringOk(bn, an)) return true;

  // First-word match: only when at least one name is a single word
  const aWords = an.split(" "), bWords = bn.split(" ");
  const aFirst = aWords[0], bFirst = bWords[0];
  if (aFirst.length >= 4 && aFirst === bFirst && (aWords.length === 1 || bWords.length === 1)) return true;
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
  // Filter to only Round 1 dates (March 19-20) to avoid matching future round games
  const r1Events = uniqueEvents.filter((ev) => {
    const evDate = ev.date ? ev.date.split("T")[0] : "";
    return evDate >= "2026-03-18" && evDate <= "2026-03-21";
  });
  let liveCount = 0;
  let finalCount = 0;

  for (const regionData of Object.values(regions)) {
    const games = regionData?.round1;
    if (!games) continue;

    for (const game of games) {
      const score = matchEspnGame(game, espnIndex, r1Events);
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

function buildNextRound(games) {
  const nextRound = [];
  for (let i = 0; i < games.length; i += 2) {
    if (!games[i] || !games[i + 1]) { nextRound.push(null); continue; }
    const w1 = getWinnerFromGame(games[i]);
    const w2 = getWinnerFromGame(games[i + 1]);
    if (w1 && w2) nextRound.push({ top: w1, bottom: w2, decided: true });
    else if (w1) nextRound.push({ top: w1, bottom: null, decided: false });
    else if (w2) nextRound.push({ top: null, bottom: w2, decided: false });
    else nextRound.push(null);
  }
  return nextRound;
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

// Date ranges for each round's Polymarket slugs (uses ET dates in slugs)
const ROUND_DATE_GUESSES = {
  round2: ["2026-03-21", "2026-03-22", "2026-03-23"],
  sweet16: ["2026-03-26", "2026-03-27", "2026-03-28"],
  elite8: ["2026-03-28", "2026-03-29", "2026-03-30"],
  finalfour: ["2026-04-04", "2026-04-05"],
  championship: ["2026-04-06", "2026-04-07"],
};

function generateMatchupSlugs(matchups, dateGuesses) {
  const slugs = [];
  for (const matchup of matchups) {
    if (!matchup?.decided) { slugs.push(null); continue; }
    const topAbbr = getTeamSlugAbbr(matchup.top.team);
    const botAbbr = getTeamSlugAbbr(matchup.bottom.team);
    const candidates = [];
    for (const date of dateGuesses) {
      candidates.push(`cbb-${topAbbr}-${botAbbr}-${date}`);
      candidates.push(`cbb-${botAbbr}-${topAbbr}-${date}`);
    }
    slugs.push(candidates);
  }
  return slugs;
}

async function fetchMatchupOdds(matchups, dateGuesses) {
  const slugCandidates = generateMatchupSlugs(matchups, dateGuesses);
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

// Apply odds and ESPN scores to a list of matchups
// roundDateRange: [startDate, endDate] strings like "2026-03-21" to filter ESPN events by date
function applyMatchupData(matchups, oddsMap, espnIndex, uniqueEvents, globalOffset, roundDateRange) {
  let liveCount = 0, finalCount = 0;

  // Filter ESPN events to only those within this round's date range
  const filteredEvents = (roundDateRange && uniqueEvents)
    ? uniqueEvents.filter((ev) => {
        const evDate = ev.date ? ev.date.split("T")[0] : "";
        return evDate >= roundDateRange[0] && evDate <= roundDateRange[1];
      })
    : uniqueEvents;

  for (let i = 0; i < matchups.length; i++) {
    const matchup = matchups[i];
    if (!matchup) continue;

    // Apply Polymarket odds
    const oddsData = oddsMap?.get(globalOffset + i);
    if (oddsData && matchup.decided) {
      try {
        const { market, slug } = oddsData;
        const odds = parseMarketOdds(market, matchup.top.team);
        if (odds) {
          matchup.topOdds = odds.topOdds;
          matchup.bottomOdds = odds.bottomOdds;
          matchup.url = `https://polymarket.com/sports/cbb/${slug}`;
        }
      } catch { /* skip */ }
    }

    // Apply ESPN scores (strict dual-team match, filtered by round dates)
    if (matchup.decided && filteredEvents && filteredEvents.length > 0) {
      const topName = matchup.top.team.toLowerCase();
      const botName = matchup.bottom.team.toLowerCase();
      const topAbbr = matchup.top.abbr?.toLowerCase() || "";
      const botAbbr = matchup.bottom.abbr?.toLowerCase() || "";
      let matched = null;
      for (const ev of filteredEvents) {
        const comps = ev.competitions?.[0];
        if (!comps) continue;
        let hasTop = false, hasBot = false;
        for (const t of comps.competitors || []) {
          const tName = t.team?.displayName?.toLowerCase() || "";
          const tShort = t.team?.shortDisplayName?.toLowerCase() || "";
          const tAbbr = t.team?.abbreviation?.toLowerCase() || "";
          if (namesMatch(tName, topName) || namesMatch(tShort, topName) || tAbbr === topAbbr) hasTop = true;
          if (namesMatch(tName, botName) || namesMatch(tShort, botName) || tAbbr === botAbbr) hasBot = true;
        }
        if (hasTop && hasBot) { matched = ev; break; }
      }
      if (matched) {
        const score = matchEspnGame({ top: matchup.top, bottom: matchup.bottom }, espnIndex, [matched]);
        if (score && score.status !== "pre") {
          matchup.liveScore = score;
          if (score.status === "final") finalCount++;
          else liveCount++;
        }
      }
    }
  }
  return { liveCount, finalCount };
}

// ESPN date ranges for each round (for filtering score matches to correct round)
// ESPN event dates are UTC — games broadcast evening ET often have UTC dates one day earlier
const ROUND_ESPN_DATES = {
  round2: ["2026-03-20", "2026-03-23"],
  sweet16: ["2026-03-26", "2026-03-29"],
  elite8: ["2026-03-28", "2026-03-31"],
  finalfour: ["2026-04-03", "2026-04-06"],
  championship: ["2026-04-06", "2026-04-08"],
};

async function buildAllRounds(regions, espnIndex, uniqueEvents) {
  let totalLive = 0, totalFinal = 0;

  // Build round 2 from round 1 winners
  const allR2 = [];
  for (const regionData of Object.values(regions)) {
    const r2 = buildRound2Matchups(regionData.round1);
    regionData.round2 = r2;
    allR2.push(...r2);
  }

  // Fetch and apply Round 2 odds
  const r2Odds = await fetchMatchupOdds(allR2, ROUND_DATE_GUESSES.round2);
  let offset = 0;
  for (const regionData of Object.values(regions)) {
    const { liveCount, finalCount } = applyMatchupData(regionData.round2, r2Odds, espnIndex, uniqueEvents, offset, ROUND_ESPN_DATES.round2);
    totalLive += liveCount; totalFinal += finalCount;
    offset += regionData.round2.length;
  }

  // Build Sweet 16 from round 2 winners
  const allS16 = [];
  for (const regionData of Object.values(regions)) {
    const r2Games = (regionData.round2 || []).filter(m => m?.decided).map(m => ({
      top: m.top, bottom: m.bottom, liveScore: m.liveScore || null
    }));
    const s16 = buildNextRound(r2Games);
    regionData.sweet16 = s16;
    allS16.push(...s16);
  }

  // Fetch and apply Sweet 16 odds
  const s16Odds = await fetchMatchupOdds(allS16, ROUND_DATE_GUESSES.sweet16);
  offset = 0;
  for (const regionData of Object.values(regions)) {
    const { liveCount, finalCount } = applyMatchupData(regionData.sweet16, s16Odds, espnIndex, uniqueEvents, offset, ROUND_ESPN_DATES.sweet16);
    totalLive += liveCount; totalFinal += finalCount;
    offset += regionData.sweet16.length;
  }

  // Build Elite 8 from Sweet 16 winners
  for (const regionData of Object.values(regions)) {
    const s16Games = (regionData.sweet16 || []).filter(m => m?.decided).map(m => ({
      top: m.top, bottom: m.bottom, liveScore: m.liveScore || null
    }));
    const e8 = buildNextRound(s16Games);
    regionData.elite8 = e8;
  }

  // Fetch and apply Elite 8 odds
  const allE8 = [];
  for (const regionData of Object.values(regions)) allE8.push(...(regionData.elite8 || []));
  const e8Odds = await fetchMatchupOdds(allE8, ROUND_DATE_GUESSES.elite8);
  offset = 0;
  for (const regionData of Object.values(regions)) {
    const { liveCount, finalCount } = applyMatchupData(regionData.elite8 || [], e8Odds, espnIndex, uniqueEvents, offset, ROUND_ESPN_DATES.elite8);
    totalLive += liveCount; totalFinal += finalCount;
    offset += (regionData.elite8 || []).length;
  }

  // Build Final Four from Elite 8 winners (cross-region)
  // East vs South, West vs Midwest
  const regionKeys = Object.keys(regions);
  const e8Winners = {};
  for (const key of regionKeys) {
    const e8 = regions[key].elite8 || [];
    const game = e8[0];
    if (game?.liveScore?.status === "final") {
      const topScore = parseInt(game.liveScore.topScore) || 0;
      const botScore = parseInt(game.liveScore.bottomScore) || 0;
      e8Winners[key] = topScore > botScore ? game.top : game.bottom;
    }
  }

  const ffMatchups = [];
  // Semi 1: East vs South
  const ff1Top = e8Winners.east || null;
  const ff1Bot = e8Winners.south || null;
  if (ff1Top && ff1Bot) {
    ffMatchups.push({ top: ff1Top, bottom: ff1Bot, decided: true });
  } else {
    ffMatchups.push({ top: ff1Top, bottom: ff1Bot, decided: false });
  }
  // Semi 2: West vs Midwest
  const ff2Top = e8Winners.west || null;
  const ff2Bot = e8Winners.midwest || null;
  if (ff2Top && ff2Bot) {
    ffMatchups.push({ top: ff2Top, bottom: ff2Bot, decided: true });
  } else {
    ffMatchups.push({ top: ff2Top, bottom: ff2Bot, decided: false });
  }

  // Fetch and apply Final Four odds + ESPN scores
  const ffOdds = await fetchMatchupOdds(ffMatchups, ROUND_DATE_GUESSES.finalfour);
  const { liveCount: ffLive, finalCount: ffFinal } = applyMatchupData(ffMatchups, ffOdds, espnIndex, uniqueEvents, 0, ROUND_ESPN_DATES.finalfour);
  totalLive += ffLive;
  totalFinal += ffFinal;

  // Build Championship from Final Four winners
  let championship = null;
  const ff1Winner = ffMatchups[0]?.liveScore?.status === "final"
    ? (parseInt(ffMatchups[0].liveScore.topScore) > parseInt(ffMatchups[0].liveScore.bottomScore) ? ffMatchups[0].top : ffMatchups[0].bottom)
    : null;
  const ff2Winner = ffMatchups[1]?.liveScore?.status === "final"
    ? (parseInt(ffMatchups[1].liveScore.topScore) > parseInt(ffMatchups[1].liveScore.bottomScore) ? ffMatchups[1].top : ffMatchups[1].bottom)
    : null;
  if (ff1Winner && ff2Winner) {
    championship = { top: ff1Winner, bottom: ff2Winner, decided: true };
  } else {
    championship = { top: ff1Winner, bottom: ff2Winner, decided: false };
  }
  const champOdds = await fetchMatchupOdds([championship], ROUND_DATE_GUESSES.championship);
  const { liveCount: champLive, finalCount: champFinal } = applyMatchupData([championship], champOdds, espnIndex, uniqueEvents, 0, ROUND_ESPN_DATES.championship);
  totalLive += champLive;
  totalFinal += champFinal;

  return { totalLive, totalFinal, finalFour: ffMatchups, championship };
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
function buildSchedule(espnEvents) {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const schedule = [];
  let nextGame = null;
  let nextTime = Infinity;

  for (const event of espnEvents) {
    const statusName = event.status?.type?.name || "";
    const gameTime = new Date(event.date);
    const gameDateStr = gameTime.toISOString().split("T")[0];
    const comps = event.competitions?.[0];
    const teams = comps?.competitors || [];

    // Build game info
    const gameInfo = {
      time: event.date,
      status: statusName === "STATUS_FINAL" ? "final"
        : statusName === "STATUS_IN_PROGRESS" || statusName === "STATUS_HALFTIME" ? "live"
        : "scheduled",
      teams: teams.map((t) => ({
        name: t.team?.shortDisplayName || t.team?.displayName || "TBD",
        seed: t.curatedRank?.current || null,
        score: t.score || null,
        logo: t.team?.logo || null,
        winner: t.winner || false,
      })),
    };

    // Include games within the next 7 days in schedule
    const weekAhead = new Date(now);
    weekAhead.setDate(weekAhead.getDate() + 7);
    const weekAheadStr = weekAhead.toISOString().split("T")[0];
    if (gameDateStr >= todayStr && gameDateStr <= weekAheadStr) {
      schedule.push(gameInfo);
    }

    // Track next upcoming game
    if (statusName === "STATUS_SCHEDULED" && gameTime > now && gameTime.getTime() < nextTime) {
      nextTime = gameTime.getTime();
      nextGame = {
        time: event.date,
        teams: teams.map((t) => t.team?.shortDisplayName || t.team?.displayName || "TBD").join(" vs "),
      };
    }
  }

  // Sort schedule by time
  schedule.sort((a, b) => new Date(a.time) - new Date(b.time));

  return { schedule, nextGame };
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

  // Apply Polymarket odds and ESPN round 1 scores
  const oddsUpdated = applyPolymarketOdds(regions, marketData);
  const { liveCount: r1LiveCount, finalCount: r1FinalCount } = espnEvents.length > 0
    ? applyLiveScores(regions, espnEvents)
    : { liveCount: 0, finalCount: 0 };

  // Apply team logos from ESPN data
  if (espnEvents.length > 0) {
    applyTeamLogos(regions, espnEvents);
  }

  // Build ESPN index for later round matching
  const espnIndex = buildEspnIndex(espnEvents);
  const uniqueEvents = [...new Set(espnIndex.values())];

  // Build all rounds (R2 → Sweet 16 → Elite 8 → Final Four → Championship) with odds and scores
  const { totalLive: laterLive, totalFinal: laterFinal, finalFour, championship } = await buildAllRounds(regions, espnIndex, uniqueEvents);

  // Build schedule from all events
  const { schedule, nextGame } = buildSchedule(espnEvents);

  // Determine current tournament phase for status message (use local date, not UTC)
  const localNow = new Date();
  const todayDate = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`;
  let tournamentPhase = null;
  if (todayDate < "2026-03-19") tournamentPhase = "Round 1 begins March 19";
  else if (todayDate >= "2026-03-23" && todayDate < "2026-03-27") tournamentPhase = "Sweet 16 begins March 27";
  else if (todayDate >= "2026-03-29" && todayDate < "2026-03-29") tournamentPhase = "Elite 8 begins March 29";
  else if (todayDate >= "2026-03-30" && todayDate < "2026-04-04") tournamentPhase = "Final Four begins April 4";
  else if (todayDate >= "2026-04-04" && todayDate <= "2026-04-05") tournamentPhase = "Final Four";
  else if (todayDate >= "2026-04-06" && todayDate < "2026-04-07") tournamentPhase = "Championship Game on April 7";
  else if (todayDate === "2026-04-07") tournamentPhase = "Championship Game";

  const result = {
    regions,
    finalFour: finalFour || [],
    championship: championship || null,
    lastUpdated: new Date().toISOString(),
    liveGames: r1LiveCount + laterLive,
    finalGames: r1FinalCount + laterFinal,
    oddsUpdated,
    oddsSource: oddsUpdated > 0 ? "polymarket-live" : "fallback",
    futures,
    nextGame,
    schedule,
    tournamentPhase,
  };

  cache = { data: result, timestamp: now };

  return Response.json({
    ...result,
    cached: false,
    cacheAge: 0,
    cacheTTL: Math.round(CACHE_TTL_MS / 1000),
  });
}
