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

// ── NCAA Live Scores ─────────────────────────────────────
const NCAA_API_BASE = "https://ncaa-api.henrygd.me";

async function fetchNcaaScores() {
  try {
    const dateStr = new Date().toISOString().split("T")[0];
    const res = await fetch(
      `${NCAA_API_BASE}/scoreboard/basketball-men/d1/${dateStr}`,
      { headers: { Accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.games || [];
  } catch {
    return [];
  }
}

function buildNcaaIndex(ncaaGames) {
  const index = new Map();
  for (const ncaaGame of ncaaGames) {
    const g = ncaaGame.game;
    if (!g) continue;
    const names = [
      g.away?.names?.short?.toLowerCase(),
      g.away?.names?.full?.toLowerCase(),
      g.home?.names?.short?.toLowerCase(),
      g.home?.names?.full?.toLowerCase(),
    ].filter(Boolean);
    for (const name of names) {
      index.set(name, ncaaGame);
    }
  }
  return index;
}

function matchScoreToGame(game, ncaaIndex) {
  const topName = game.top.team.toLowerCase();
  const botName = game.bottom.team.toLowerCase();

  let ncaaGame = null;
  for (const [name, g] of ncaaIndex) {
    if (name.includes(topName) || name.includes(botName)) {
      ncaaGame = g;
      break;
    }
  }
  if (!ncaaGame) return null;

  const gameData = ncaaGame.game || {};
  const home = gameData.home?.names?.short?.toLowerCase() || "";
  const homeFull = gameData.home?.names?.full?.toLowerCase() || "";
  const isTopHome = home.includes(topName) || homeFull.includes(topName);

  return {
    status: gameData.gameState || gameData.status || "pre",
    period: gameData.currentPeriod || "",
    clock: gameData.contestClock || "",
    topScore: isTopHome ? gameData.home?.score : gameData.away?.score,
    bottomScore: isTopHome ? gameData.away?.score : gameData.home?.score,
    startTime: gameData.startTime || gameData.startTimeEpoch || null,
  };
}

function applyLiveScores(regions, ncaaGames) {
  const ncaaIndex = buildNcaaIndex(ncaaGames);
  let liveCount = 0;
  let finalCount = 0;

  for (const regionData of Object.values(regions)) {
    const games = regionData?.round1;
    if (!games) continue;

    for (const game of games) {
      const score = matchScoreToGame(game, ncaaIndex);
      if (score) {
        game.liveScore = score;
        if (score.status === "final") finalCount++;
        else if (score.status !== "pre") liveCount++;
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

  // Fetch Polymarket odds and NCAA scores in parallel
  const slugs = collectSlugs(regions);
  const [marketData, ncaaGames] = await Promise.all([
    fetchPolymarketOdds(slugs),
    fetchNcaaScores(),
  ]);

  // Apply live data
  const oddsUpdated = applyPolymarketOdds(regions, marketData);
  const { liveCount, finalCount: scoreFinalCount } = ncaaGames.length > 0
    ? applyLiveScores(regions, ncaaGames)
    : { liveCount: 0, finalCount: 0 };

  // Mark games as resolved when Polymarket odds are 100/0 but no NCAA score
  let resolvedCount = 0;
  for (const regionData of Object.values(regions)) {
    for (const game of regionData.round1) {
      if (game.liveScore) continue; // already has score data
      const top = game.topOdds;
      const bot = game.bottomOdds;
      if ((top >= 99 && bot <= 1) || (bot >= 99 && top <= 1)) {
        const topWon = top > bot;
        game.liveScore = {
          status: "final",
          period: "FINAL",
          clock: "",
          topScore: topWon ? "W" : "L",
          bottomScore: topWon ? "L" : "W",
        };
        resolvedCount++;
      }
    }
  }
  const finalCount = scoreFinalCount + resolvedCount;

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
