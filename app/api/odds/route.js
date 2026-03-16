import { DEFAULT_REGIONS } from "../../../lib/default-data";

// ── Server-side cache ────────────────────────────────────
const CACHE_TTL_MS = 30_000; // 30 seconds

let cache = {
  data: null,
  timestamp: 0,
};

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

// Build a lookup index from NCAA games: team name → game data
// Done once per fetch, avoids O(N*M) quadratic matching
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

  // Try exact match first, then scan for includes
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
  const updated = JSON.parse(JSON.stringify(regions));
  let liveCount = 0;
  let finalCount = 0;

  for (const regionKey of Object.keys(updated)) {
    const games = updated[regionKey]?.round1;
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

  return { regions: updated, liveCount, finalCount };
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

  const ncaaGames = await fetchNcaaScores();

  const { regions, liveCount, finalCount } = ncaaGames.length > 0
    ? applyLiveScores(DEFAULT_REGIONS, ncaaGames)
    : { regions: DEFAULT_REGIONS, liveCount: 0, finalCount: 0 };

  const result = {
    regions,
    lastUpdated: new Date().toISOString(),
    liveGames: liveCount,
    finalGames: finalCount,
  };

  cache = { data: result, timestamp: now };

  return Response.json({
    ...result,
    cached: false,
    cacheAge: 0,
    cacheTTL: Math.round(CACHE_TTL_MS / 1000),
  });
}
