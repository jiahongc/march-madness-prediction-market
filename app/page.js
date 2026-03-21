"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { DEFAULT_REGIONS } from "../lib/default-data";

const REGION_KEYS = ["east", "south", "west", "midwest"];
const ROUND_LABELS = ["Round 1 \u00b7 Mar 19\u201320", "Round 2 \u00b7 Mar 21\u201322", "Sweet 16 \u00b7 Mar 27\u201328", "Elite 8 \u00b7 Mar 29\u201330"];

// ── Helpers ──────────────────────────────────────────────
function seedClass(s) {
  if (s <= 1) return "seed-1";
  if (s <= 2) return "seed-2";
  if (s <= 3) return "seed-3";
  if (s <= 4) return "seed-4";
  return "seed-low";
}

function oddsClass(pct) {
  if (pct >= 70) return "odds-high";
  if (pct >= 40) return "odds-mid";
  return "odds-low";
}

function calcPayout(oddsCents) {
  if (!oddsCents || oddsCents <= 0) return null;
  const profit = 100 / (oddsCents / 100) - 100;
  return profit.toFixed(2);
}

function formatPayout(oddsCents) {
  const profit = calcPayout(oddsCents);
  return profit ? "+$" + profit : "\u2014";
}

function formatScore(score) {
  return score ?? "-";
}

function formatClock(score) {
  return score.period ? `${score.period} ${score.clock}` : "LIVE";
}

function isFinal(game) {
  return game.liveScore?.status === "final";
}

function isLive(game) {
  const s = game.liveScore?.status;
  return s && s !== "pre" && s !== "final";
}

function getWinner(game) {
  if (!isFinal(game)) return null;
  const topScore = parseInt(game.liveScore.topScore) || 0;
  const botScore = parseInt(game.liveScore.bottomScore) || 0;
  if (topScore === botScore) return null;
  return topScore > botScore ? game.top : game.bottom;
}

function matchupsToGames(matchups) {
  return matchups
    .filter((m) => m?.decided)
    .map((m) => ({ top: m.top, bottom: m.bottom, liveScore: null }));
}

function buildNextRound(games) {
  const nextRound = [];
  for (let i = 0; i < games.length; i += 2) {
    if (!games[i] || !games[i + 1]) {
      nextRound.push(null);
      continue;
    }
    const winner1 = getWinner(games[i]);
    const winner2 = getWinner(games[i + 1]);
    if (winner1 && winner2) {
      nextRound.push({ top: winner1, bottom: winner2, decided: true });
    } else if (winner1) {
      nextRound.push({ top: winner1, bottom: null, decided: false });
    } else if (winner2) {
      nextRound.push({ top: null, bottom: winner2, decided: false });
    } else {
      nextRound.push(null);
    }
  }
  return nextRound;
}

function calcRegionRounds(regionData) {
  const games = regionData.round1;
  // Use server-provided round2 (with odds) if available, otherwise compute client-side
  const r2 = regionData.round2 || buildNextRound(games);
  const r3 = buildNextRound(matchupsToGames(r2));
  const r4 = buildNextRound(matchupsToGames(r3));
  return { games, round2: r2, round3: r3, round4: r4 };
}

// ── Shared sub-components ────────────────────────────────
function SeedBadge({ seed }) {
  return <span className={`seed ${seedClass(seed)}`}>{seed}</span>;
}

function TeamLogo({ logo }) {
  if (!logo) return null;
  return <img className="team-logo" src={logo} alt="" width="18" height="18" loading="lazy" />;
}

function NextGameCountdown({ nextGame }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const gameTime = new Date(nextGame.time);
  const diff = gameTime - now;
  if (diff <= 0) return <span>Next game starting soon: {nextGame.teams}</span>;

  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <span className="next-game-countdown">
      Next tip-off in <strong>{timeStr}</strong> — {nextGame.teams}
    </span>
  );
}

function FuturesView({ futures }) {
  if (!futures || futures.length === 0) {
    return <div className="futures-empty">Loading championship futures...</div>;
  }

  const maxOdds = futures[0]?.odds || 1;

  return (
    <div className="futures-container">
      <div className="futures-header">
        <h2 className="futures-title">Championship Futures</h2>
        <p className="futures-subtitle">
          Polymarket odds to win the 2026 NCAA Tournament
        </p>
      </div>
      <div className="futures-grid">
        {futures.map((f, i) => (
          <a
            key={f.slug || i}
            className={`futures-card ${i < 3 ? "futures-top3" : ""}`}
            href={`https://polymarket.com/sports/cbb/${f.slug}`}
            target="_blank"
            rel="noopener"
          >
            <div className="futures-rank">#{i + 1}</div>
            <div className="futures-team-name">{f.team}</div>
            <div className="futures-odds">{f.odds}%</div>
            <div className="futures-bar-track">
              <div className="futures-bar-fill" style={{ width: `${(f.odds / maxOdds) * 100}%` }} />
            </div>
            <div className="futures-payout">
              +${f.odds > 0 ? ((100 / (f.odds / 100)) - 100).toFixed(0) : "—"} on $100
            </div>
            {f.volume > 0 && (
              <div className="futures-volume">${(f.volume / 1_000_000).toFixed(1)}M volume</div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

function ScheduleView({ schedule, timezone }) {
  if (!schedule || schedule.length === 0) {
    return <div className="futures-empty">No games scheduled</div>;
  }

  return (
    <div className="schedule-section">
      <div className="schedule-title">Today &amp; Tomorrow</div>
      <div className="schedule-grid">
        {schedule.map((game, i) => {
          const t1 = game.teams[0] || {};
          const t2 = game.teams[1] || {};
          const gameTime = new Date(game.time);
          const timeStr = gameTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone, timeZoneName: "short" });

          return (
            <div key={i} className={`schedule-card ${game.status === "live" ? "is-live" : ""} ${game.status === "final" ? "is-final" : ""}`}>
              <div className={`schedule-time ${game.status === "live" ? "live-text" : ""}`}>
                {game.status === "live" ? "LIVE" : game.status === "final" ? "FINAL" : timeStr}
              </div>
              <div className="schedule-matchup">
                {t1.logo && <img src={t1.logo} alt="" width="20" height="20" />}
                <span>{t1.name}</span>
                {(game.status === "live" || game.status === "final") && (
                  <span className="schedule-score">{t1.score}</span>
                )}
              </div>
              <div className="schedule-vs">vs</div>
              <div className="schedule-matchup">
                {t2.logo && <img src={t2.logo} alt="" width="20" height="20" />}
                <span>{t2.name}</span>
                {(game.status === "live" || game.status === "final") && (
                  <span className="schedule-score">{t2.score}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────
export default function BracketPage() {
  const [apiData, setApiData] = useState({
    regions: DEFAULT_REGIONS,
    lastUpdated: null,
    liveGames: 0,
    finalGames: 0,
    oddsSource: "fallback",
    oddsUpdated: 0,
    cached: false,
    cacheAge: 0,
    cacheTTL: 30,
    futures: [],
    nextGame: null,
    schedule: [],
  });
  const [currentRegion, setCurrentRegion] = useState("full");
  const [modalGame, setModalGame] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [timezone, setTimezone] = useState("America/New_York");
  const prevLiveCount = useRef(0);
  const initialLoadDone = useRef(false);

  // Detect mobile viewport and default to region view on mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    if (!initialLoadDone.current && window.innerWidth < 768) {
      setCurrentRegion("east");
      initialLoadDone.current = true;
    } else {
      initialLoadDone.current = true;
    }
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const res = await fetch("/api/odds");
      if (!res.ok) return;
      const data = await res.json();
      setApiData((prev) => {
        // Skip no-op update if data hasn't changed
        if (data.lastUpdated === prev.rawTimestamp) return prev;
        return {
          regions: data.regions,
          lastUpdated: new Date(data.lastUpdated),
          rawTimestamp: data.lastUpdated,
          liveGames: data.liveGames,
          finalGames: data.finalGames,
          oddsSource: data.oddsSource,
          oddsUpdated: data.oddsUpdated,
          cached: data.cached,
          cacheAge: data.cacheAge,
          cacheTTL: data.cacheTTL,
          futures: data.futures || [],
          nextGame: data.nextGame || null,
          schedule: data.schedule || [],
        };
      });
    } catch {
      // Keep existing data on error
    }
  }, []);

  // Fetch on mount + auto-refresh every 60 seconds
  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 60_000);
    return () => clearInterval(interval);
  }, [refreshData]);

  const { regions, lastUpdated, liveGames: liveCount, finalGames: finalCount, cached, cacheAge, cacheTTL, futures, nextGame, schedule } = apiData;
  const isFuturesView = currentRegion === "futures";

  // Collect live games across all regions (memoized)
  const liveGames = useMemo(() => {
    const result = [];
    for (const [regionKey, regionData] of Object.entries(regions)) {
      for (const game of regionData.round1) {
        if (isLive(game)) {
          result.push({ ...game, regionName: regionKey, round: "Round 1" });
        }
      }
      for (const matchup of regionData.round2 || []) {
        if (matchup && isLive(matchup)) {
          result.push({ ...matchup, regionName: regionKey, round: "Round 2",
            topOdds: matchup.topOdds, bottomOdds: matchup.bottomOdds, url: matchup.url });
        }
      }
    }
    return result;
  }, [regions]);

  // Auto-switch to Live tab when first game tips off
  useEffect(() => {
    if (liveGames.length > 0 && prevLiveCount.current === 0) {
      setCurrentRegion("live");
    }
    prevLiveCount.current = liveGames.length;
  }, [liveGames.length]);

  const isLiveView = currentRegion === "live";
  const isFullView = currentRegion === "full";
  const isScheduleView = currentRegion === "schedule";
  const skipBracket = isLiveView || isFullView || isFuturesView || isScheduleView;
  const games = skipBracket ? [] : regions[currentRegion]?.round1 || [];

  // Build advancement for later rounds (memoized, skipped on non-bracket views)
  const { round2, round3, round4 } = useMemo(() => {
    if (skipBracket) return { round2: [], round3: [], round4: [] };
    return calcRegionRounds(regions[currentRegion]);
  }, [regions, currentRegion, skipBracket]);

  return (
    <>
      <header>
        <div className="header-inner">
          <div className="logo-area">
            <svg aria-label="March Madness Bracket" width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="1" y="1" width="26" height="26" rx="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 7h4v4H7zM17 7h4v4h-4zM12 14h4v4h-4zM7 17h4v4H7zM17 17h4v4h-4z" fill="var(--accent)" opacity="0.5" />
              <line x1="11" y1="9" x2="14" y2="16" stroke="var(--accent)" strokeWidth="1.5" />
              <line x1="17" y1="9" x2="14" y2="16" stroke="var(--accent)" strokeWidth="1.5" />
            </svg>
            <div>
              <h1>March Madness 2026{liveCount > 0 && <span className="header-live-badge">LIVE</span>}</h1>
              <p className="subtitle">
                Bracket with Polymarket Odds
                {apiData.oddsSource === "polymarket-live" ? " · Live Odds" : " · Odds as of Mar 16, 2026"}
              </p>
            </div>
          </div>
          <select className="tz-select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            <option value="America/New_York">Eastern</option>
            <option value="America/Chicago">Central</option>
            <option value="America/Denver">Mountain</option>
            <option value="America/Los_Angeles">Pacific</option>
            <option value="America/Anchorage">Alaska</option>
            <option value="Pacific/Honolulu">Hawaii</option>
          </select>
        </div>
      </header>

      {lastUpdated && liveCount === 0 && (
        <div className="status-bar">
          <span className={`status-dot stale`} />
          {nextGame ? (
            <NextGameCountdown nextGame={nextGame} />
          ) : finalCount > 0 ? (
            `${finalCount} bracket ${finalCount === 1 ? "game" : "games"} completed today`
          ) : (
            "No bracket games in progress"
          )}
          <span className="status-time">Updated {lastUpdated.toLocaleTimeString(undefined, { timeZoneName: "short" })}</span>
        </div>
      )}

      <div className="region-selector">
        {liveGames.length > 0 && (
          <button className={`region-btn live-tab ${currentRegion === "live" ? "active" : ""}`} onClick={() => setCurrentRegion("live")}>
            <span className="live-tab-dot" />
            Live ({liveGames.length})
          </button>
        )}
        <button className={`region-btn ${currentRegion === "full" ? "active" : ""}`} onClick={() => setCurrentRegion("full")}>
          Full Bracket
        </button>
        <div className="region-dropdown-wrap">
          <select
            className="region-dropdown"
            value={REGION_KEYS.includes(currentRegion) ? currentRegion : "east"}
            onChange={(e) => setCurrentRegion(e.target.value)}
          >
            <option value="east">East</option>
            <option value="south">South</option>
            <option value="west">West</option>
            <option value="midwest">Midwest</option>
          </select>
          <button
            className={`region-btn ${REGION_KEYS.includes(currentRegion) ? "active" : ""}`}
            onClick={() => {
              if (!REGION_KEYS.includes(currentRegion)) setCurrentRegion("east");
            }}
          >
            {REGION_KEYS.includes(currentRegion)
              ? currentRegion.charAt(0).toUpperCase() + currentRegion.slice(1)
              : "Region"}
          </button>
        </div>
        <button className={`region-btn ${currentRegion === "schedule" ? "active" : ""}`} onClick={() => setCurrentRegion("schedule")}>
          Schedule
        </button>
        <button className={`region-btn ${currentRegion === "futures" ? "active" : ""}`} onClick={() => setCurrentRegion("futures")}>
          Futures
        </button>
      </div>

      <main id="bracket-main">
        {currentRegion === "schedule" ? (
          <ScheduleView schedule={schedule} timezone={timezone} />
        ) : isFuturesView ? (
          <FuturesView futures={futures} />
        ) : isFullView ? (
          <FullBracketView regions={regions} onGameClick={setModalGame} />
        ) : isLiveView ? (
          <div className="live-games-grid">
            {liveGames.map((game, i) => (
              <LiveGameCard key={i} game={game} onClick={() => setModalGame(game)} />
            ))}
          </div>
        ) : isMobile ? (
          /* Mobile: card list instead of bracket */
          <div className="mobile-card-list">
            {games.map((game, i) => (
              <MatchupCard key={i} game={game} onClick={() => setModalGame(game)} />
            ))}
          </div>
        ) : (
        <div className="bracket-scroll">
          <div className="bracket">
            <div className="round-col">
              <div className="round-label">{ROUND_LABELS[0]}</div>
              {games.map((game, i) => (
                <div key={i} style={{ flex: 1, display: "flex", alignItems: "center" }}>
                  <MatchupCard game={game} onClick={() => setModalGame(game)} />
                </div>
              ))}
            </div>

            <ConnectorCol count={4} flex={2} />

            <div className="round-col">
              <div className="round-label">{ROUND_LABELS[1]}</div>
              {round2.map((matchup, i) => (
                <div key={i} style={{ flex: 2, display: "flex", alignItems: "center" }}>
                  {matchup ? <AdvancedSlot matchup={matchup} /> : <div className="future-slot">TBD</div>}
                </div>
              ))}
            </div>

            <ConnectorCol count={2} flex={4} />

            <div className="round-col">
              <div className="round-label">{ROUND_LABELS[2]}</div>
              {round3.map((matchup, i) => (
                <div key={i} style={{ flex: 4, display: "flex", alignItems: "center" }}>
                  {matchup ? <AdvancedSlot matchup={matchup} /> : <div className="future-slot">TBD</div>}
                </div>
              ))}
              {round3.length < 2 && Array.from({ length: 2 - round3.length }).map((_, i) => (
                <div key={`empty-${i}`} style={{ flex: 4, display: "flex", alignItems: "center" }}>
                  <div className="future-slot">TBD</div>
                </div>
              ))}
            </div>

            <ConnectorCol count={1} flex={8} />

            <div className="round-col">
              <div className="round-label">{ROUND_LABELS[3]}</div>
              <div style={{ flex: 8, display: "flex", alignItems: "center" }}>
                {round4[0] ? <AdvancedSlot matchup={round4[0]} /> : <div className="future-slot">TBD</div>}
              </div>
            </div>

            <div className="connector-col">
              <div className="round-label">&nbsp;</div>
              <div className="conn-group" style={{ flex: 8 }}>
                <svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}>
                  <line x1="0" y1="50%" x2="100%" y2="50%" stroke="var(--connector)" strokeWidth="1.5" />
                </svg>
              </div>
            </div>

            <div className="round-col">
              <div className="round-label">Final Four</div>
              <div style={{ flex: 8, display: "flex", alignItems: "center" }}>
                <div className="future-slot">&#127942;</div>
              </div>
            </div>
          </div>
        </div>
        )}
      </main>

      {modalGame && <GameModal game={modalGame} onClose={() => setModalGame(null)} />}

      <footer>
        <div className="footer-inner">
          <p>
            Odds from{" "}
            <a href="https://polymarket.com/sports/cbb/games" target="_blank" rel="noopener">Polymarket</a>.{" "}
            {lastUpdated ? `Last updated ${lastUpdated.toLocaleString(undefined, { timeZoneName: "short" })}.` : "Prices change in real time."}{" "}
            Auto-refreshes every 60 seconds.
          </p>
          <a className="github-link" href="https://github.com/jiahongc/march-madness-prediction-market" target="_blank" rel="noopener" title="View on GitHub">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </a>
        </div>
      </footer>
    </>
  );
}

// ── Final Four Slot ──────────────────────────────────────
function FFSlot({ roundA, roundB, labelA, labelB }) {
  // roundA/roundB are Elite 8 matchups (round4[0] from each region)
  // If decided, both teams are known — show who's playing in the Elite 8
  // The FF matchup is the WINNER of roundA vs WINNER of roundB
  const winnerA = roundA?.decided ? getWinner({ top: roundA.top, bottom: roundA.bottom, liveScore: roundA.liveScore || null }) : null;
  const winnerB = roundB?.decided ? getWinner({ top: roundB.top, bottom: roundB.bottom, liveScore: roundB.liveScore || null }) : null;

  if (winnerA && winnerB) {
    return (
      <div className="ff-slot">
        <AdvancedSlot matchup={{ top: winnerA, bottom: winnerB, decided: true }} />
      </div>
    );
  }

  // Show region labels with known teams if available
  const labelOrTeam = (round, label) => {
    if (!round) return label;
    if (round.decided) return `${round.top.team} / ${round.bottom.team}`;
    const known = round.top || round.bottom;
    return known ? `${known.team} / ...` : label;
  };

  return (
    <div className="ff-slot">
      <div className="future-slot ff-future">
        <span>{labelOrTeam(roundA, labelA)}</span>
        <span className="ff-vs">vs</span>
        <span>{labelOrTeam(roundB, labelB)}</span>
      </div>
    </div>
  );
}

// ── Full Bracket View ────────────────────────────────────
function FullBracketView({ regions, onGameClick }) {
  const allRounds = useMemo(() => ({
    east: calcRegionRounds(regions.east),
    south: calcRegionRounds(regions.south),
    west: calcRegionRounds(regions.west),
    midwest: calcRegionRounds(regions.midwest),
  }), [regions]);

  return (
    <div className="full-bracket-scroll">
      <div className="full-bracket-container">
        {/* Left half: East + South flowing left→right */}
        <div className="full-bracket-half">
          <HalfBracket name="East" rounds={allRounds.east} onGameClick={onGameClick} />
          <HalfBracket name="South" rounds={allRounds.south} onGameClick={onGameClick} />
        </div>

        {/* Center: Final Four + Championship */}
        <div className="full-bracket-center">
          <div className="ff-label">Final Four</div>
          <div className="ff-slots">
            <FFSlot roundA={allRounds.east.round4[0]} roundB={allRounds.south.round4[0]} labelA="East" labelB="South" />
            <div className="ff-championship">
              <div className="future-slot ff-champ">&#127942; Championship</div>
            </div>
            <FFSlot roundA={allRounds.west.round4[0]} roundB={allRounds.midwest.round4[0]} labelA="West" labelB="Midwest" />
          </div>
        </div>

        {/* Right half: West + Midwest flowing right→left (mirrored) */}
        <div className="full-bracket-half">
          <HalfBracket name="West" rounds={allRounds.west} onGameClick={onGameClick} mirrored />
          <HalfBracket name="Midwest" rounds={allRounds.midwest} onGameClick={onGameClick} mirrored />
        </div>
      </div>
    </div>
  );
}

function HalfBracket({ name, rounds, onGameClick, mirrored }) {
  const { games, round2, round3, round4 } = rounds;

  const cols = (
    <>
      <div className="round-col">
        <div className="round-label">{ROUND_LABELS[0]}</div>
        {games.map((game, i) => (
          <div key={i} style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <MatchupCard game={game} onClick={() => onGameClick(game)} />
          </div>
        ))}
      </div>

      <ConnectorCol count={4} flex={2} mirrored={mirrored} />

      <div className="round-col">
        <div className="round-label">{ROUND_LABELS[1]}</div>
        {round2.map((matchup, i) => (
          <div key={i} style={{ flex: 2, display: "flex", alignItems: "center" }}>
            {matchup ? <AdvancedSlot matchup={matchup} /> : <div className="future-slot">TBD</div>}
          </div>
        ))}
      </div>

      <ConnectorCol count={2} flex={4} mirrored={mirrored} />

      <div className="round-col">
        <div className="round-label">{ROUND_LABELS[2]}</div>
        {round3.map((matchup, i) => (
          <div key={i} style={{ flex: 4, display: "flex", alignItems: "center" }}>
            {matchup ? <AdvancedSlot matchup={matchup} /> : <div className="future-slot">TBD</div>}
          </div>
        ))}
        {round3.length < 2 && Array.from({ length: 2 - round3.length }).map((_, i) => (
          <div key={`empty-${i}`} style={{ flex: 4, display: "flex", alignItems: "center" }}>
            <div className="future-slot">TBD</div>
          </div>
        ))}
      </div>

      <ConnectorCol count={1} flex={8} mirrored={mirrored} />

      <div className="round-col">
        <div className="round-label">{ROUND_LABELS[3]}</div>
        <div style={{ flex: 8, display: "flex", alignItems: "center" }}>
          {round4[0] ? <AdvancedSlot matchup={round4[0]} /> : <div className="future-slot">TBD</div>}
        </div>
      </div>
    </>
  );

  return (
    <div className="half-bracket-region">
      <div className="half-bracket-name">{name}</div>
      <div className={`bracket half-bracket ${mirrored ? "bracket-mirrored" : ""}`}>
        {cols}
      </div>
    </div>
  );
}

// ── Connector Column ────────────────────────────────────
const ConnectorCol = memo(function ConnectorCol({ count, flex, mirrored }) {
  return (
    <div className="connector-col">
      <div className="round-label">&nbsp;</div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="conn-group" style={{ flex }}>
          <svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}>
            {mirrored ? (
              <>
                <line x1="100%" y1="25%" x2="50%" y2="25%" stroke="var(--connector)" strokeWidth="1.5" />
                <line x1="100%" y1="75%" x2="50%" y2="75%" stroke="var(--connector)" strokeWidth="1.5" />
                <line x1="50%" y1="25%" x2="50%" y2="75%" stroke="var(--connector)" strokeWidth="1.5" />
                <line x1="50%" y1="50%" x2="0" y2="50%" stroke="var(--connector)" strokeWidth="1.5" />
              </>
            ) : (
              <>
                <line x1="0" y1="25%" x2="50%" y2="25%" stroke="var(--connector)" strokeWidth="1.5" />
                <line x1="0" y1="75%" x2="50%" y2="75%" stroke="var(--connector)" strokeWidth="1.5" />
                <line x1="50%" y1="25%" x2="50%" y2="75%" stroke="var(--connector)" strokeWidth="1.5" />
                <line x1="50%" y1="50%" x2="100%" y2="50%" stroke="var(--connector)" strokeWidth="1.5" />
              </>
            )}
          </svg>
        </div>
      ))}
    </div>
  );
});

// ── Advanced Slot ────────────────────────────────────────
function AdvancedSlot({ matchup }) {
  const hasOdds = matchup.topOdds != null && matchup.bottomOdds != null;

  if (matchup.decided) {
    return (
      <div className={`advanced-slot decided ${hasOdds ? "has-odds" : ""}`}>
        <div className="advanced-team">
          <TeamLogo logo={matchup.top.logo} />
          <SeedBadge seed={matchup.top.seed} />
          <span className="tname">{matchup.top.team}</span>
          {hasOdds && (
            <span className={`odds-badge ${oddsClass(matchup.topOdds)}`}>{Math.round(matchup.topOdds)}%</span>
          )}
        </div>
        <div className="advanced-vs">vs</div>
        <div className="advanced-team">
          <TeamLogo logo={matchup.bottom.logo} />
          <SeedBadge seed={matchup.bottom.seed} />
          <span className="tname">{matchup.bottom.team}</span>
          {hasOdds && (
            <span className={`odds-badge ${oddsClass(matchup.bottomOdds)}`}>{Math.round(matchup.bottomOdds)}%</span>
          )}
        </div>
        {hasOdds && (
          <>
            <div className="payout-header">Profit on $100 bet</div>
            <div className="payout-bar">
              <div className="payout-side">
                <span className="payout-label">{matchup.top.abbr || matchup.top.team.slice(0, 4).toUpperCase()} wins</span>
                <span className="payout-value">{formatPayout(matchup.topOdds)}</span>
              </div>
              <div className="payout-side">
                <span className="payout-label">{matchup.bottom.abbr || matchup.bottom.team.slice(0, 4).toUpperCase()} wins</span>
                <span className="payout-value">{formatPayout(matchup.bottomOdds)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  const known = matchup.top || matchup.bottom;
  return (
    <div className="advanced-slot partial">
      <div className="advanced-team">
        {known ? (
          <>
            <TeamLogo logo={known.logo} />
            <SeedBadge seed={known.seed} />
            <span className="tname">{known.team}</span>
          </>
        ) : (
          <span className="tname-tbd">TBD</span>
        )}
      </div>
      <div className="advanced-vs">vs</div>
      <div className="advanced-team">
        <span className="tname-tbd">TBD</span>
      </div>
    </div>
  );
}

// ── Matchup Card ─────────────────────────────────────────
function MatchupCard({ game, onClick }) {
  const gameOver = isFinal(game);
  const gameLive = isLive(game);
  const winner = gameOver ? getWinner(game) : null;
  const topWon = winner?.abbr === game.top.abbr;
  const botWon = winner?.abbr === game.bottom.abbr;

  const topPct = game.topOdds;
  const botPct = game.bottomOdds;

  const topLeading = gameLive && parseInt(game.liveScore.topScore) > parseInt(game.liveScore.bottomScore);
  const botLeading = gameLive && parseInt(game.liveScore.bottomScore) > parseInt(game.liveScore.topScore);

  // Upset watch: lower seed (higher number) has > 30% odds AND seed gap >= 3
  const seedGap = Math.abs(game.top.seed - game.bottom.seed);
  const isUpset = !gameOver && !gameLive && seedGap >= 3 && (
    (game.top.seed > game.bottom.seed && topPct > 30) ||
    (game.bottom.seed > game.top.seed && botPct > 30)
  );

  return (
    <div className={`matchup ${gameOver ? "matchup-final" : ""} ${gameLive ? "matchup-live" : ""} ${isUpset ? "matchup-upset" : ""}`} onClick={onClick}>
      {isUpset && <div className="upset-badge">Upset Watch</div>}
      {gameLive && (
        <div className="live-score-bar in-progress">
          <span className="live-pulse" />
          <span className="live-score-status">{formatClock(game.liveScore)}</span>
        </div>
      )}
      <div className={`team-row ${gameOver ? (topWon ? "winner" : "loser") : gameLive ? (topLeading ? "leading" : "") : (topPct > botPct ? "favorite" : "")}`}>
        <TeamLogo logo={game.top.logo} />
        <SeedBadge seed={game.top.seed} />
        <span className="tname">{game.top.team}</span>
        {gameOver || gameLive ? (
          <span className={`final-score ${gameLive && topLeading ? "score-leading" : ""}`}>{formatScore(game.liveScore.topScore)}</span>
        ) : topPct ? (
          <a className={`odds-badge ${oddsClass(topPct)}`} href={game.url} target="_blank" rel="noopener" title="Bet on Polymarket" onClick={(e) => e.stopPropagation()}>
            {Math.round(topPct)}%
          </a>
        ) : null}
      </div>
      <div className={`team-row ${gameOver ? (botWon ? "winner" : "loser") : gameLive ? (botLeading ? "leading" : "") : (botPct > topPct ? "favorite" : "")}`}>
        <TeamLogo logo={game.bottom.logo} />
        <SeedBadge seed={game.bottom.seed} />
        <span className="tname">{game.bottom.team}</span>
        {gameOver || gameLive ? (
          <span className={`final-score ${gameLive && botLeading ? "score-leading" : ""}`}>{formatScore(game.liveScore.bottomScore)}</span>
        ) : botPct ? (
          <a className={`odds-badge ${oddsClass(botPct)}`} href={game.url} target="_blank" rel="noopener" title="Bet on Polymarket" onClick={(e) => e.stopPropagation()}>
            {Math.round(botPct)}%
          </a>
        ) : null}
      </div>

      {!gameOver && topPct > 0 && (
        <>
          {gameLive && (
            <div className="live-odds-row">
              <a className={`odds-badge ${oddsClass(topPct)}`} href={game.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>
                {game.top.abbr} {Math.round(topPct)}%
              </a>
              <a className={`odds-badge ${oddsClass(botPct)}`} href={game.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>
                {game.bottom.abbr} {Math.round(botPct)}%
              </a>
            </div>
          )}
          <div className="payout-header">Profit on $100 bet</div>
          <div className="payout-bar">
            <div className="payout-side">
              <span className="payout-label">{game.top.abbr} wins</span>
              <a className="payout-value" href={game.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>
                {formatPayout(topPct)}
              </a>
            </div>
            <div className="payout-side">
              <span className="payout-label">{game.bottom.abbr} wins</span>
              <a className="payout-value" href={game.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>
                {formatPayout(botPct)}
              </a>
            </div>
          </div>
        </>
      )}

      {gameOver && (
        <div className="live-score-bar final">
          <span className="live-score-status">FINAL</span>
          <span className="live-score-numbers">{winner?.team} advances</span>
        </div>
      )}

      <div className="matchup-date">{game.date}</div>
    </div>
  );
}

// ── Live Game Card ───────────────────────────────────────
function LiveGameCard({ game, onClick }) {
  const score = game.liveScore;
  const topScore = parseInt(score.topScore) || 0;
  const botScore = parseInt(score.bottomScore) || 0;

  return (
    <div className="live-card" onClick={onClick}>
      <div className="live-card-header">
        <span className="live-card-region">{game.regionName}</span>
        <span className="live-card-status">
          <span className="live-pulse" />
          {formatClock(score)}
        </span>
      </div>

      <div className="live-card-teams">
        <div className={`live-card-team ${topScore > botScore ? "leading" : ""}`}>
          <TeamLogo logo={game.top.logo} />
          <SeedBadge seed={game.top.seed} />
          <span className="live-card-name">{game.top.team}</span>
          <span className="live-card-score">{formatScore(score.topScore)}</span>
        </div>
        <div className={`live-card-team ${botScore > topScore ? "leading" : ""}`}>
          <TeamLogo logo={game.bottom.logo} />
          <SeedBadge seed={game.bottom.seed} />
          <span className="live-card-name">{game.bottom.team}</span>
          <span className="live-card-score">{formatScore(score.bottomScore)}</span>
        </div>
      </div>

      <div className="live-card-odds">
        <div className="live-card-odds-side">
          <span className="live-card-odds-label">{game.top.abbr}</span>
          <span className={`odds-badge ${oddsClass(game.topOdds)}`}>{Math.round(game.topOdds)}%</span>
          <span className="live-card-payout">{formatPayout(game.topOdds)}</span>
        </div>
        <div className="live-card-odds-divider" />
        <div className="live-card-odds-side">
          <span className="live-card-odds-label">{game.bottom.abbr}</span>
          <span className={`odds-badge ${oddsClass(game.bottomOdds)}`}>{Math.round(game.bottomOdds)}%</span>
          <span className="live-card-payout">{formatPayout(game.bottomOdds)}</span>
        </div>
      </div>

      <a className="live-card-bet" href={game.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>
        Bet on Polymarket
      </a>
    </div>
  );
}

// ── Game Modal ───────────────────────────────────────────
function GameModal({ game, onClose }) {
  const gameOver = isFinal(game);
  const winner = gameOver ? getWinner(game) : null;

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <button className="modal-close" onClick={onClose}>&times;</button>
        <div className="modal-header">
          <div className="modal-vs">{game.top.team} vs {game.bottom.team}</div>
          <div className="modal-meta">
            {game.date} &middot; {game.note || "First Round"}
            {gameOver && ` · FINAL`}
          </div>
        </div>

        {gameOver ? (
          <div className="modal-final-score">
            <div className={`modal-final-team ${winner?.abbr === game.top.abbr ? "modal-winner" : "modal-loser"}`}>
              <span className="modal-final-name">{game.top.team}</span>
              <span className="modal-final-points">{formatScore(game.liveScore.topScore)}</span>
            </div>
            <div className={`modal-final-team ${winner?.abbr === game.bottom.abbr ? "modal-winner" : "modal-loser"}`}>
              <span className="modal-final-name">{game.bottom.team}</span>
              <span className="modal-final-points">{formatScore(game.liveScore.bottomScore)}</span>
            </div>
          </div>
        ) : (
          <div className="modal-teams">
            {[game.top, game.bottom].map((team) => (
              <div key={team.abbr} className="modal-team-col">
                <div className="modal-team-seed">#{team.seed} seed</div>
                <div className="modal-team-name">{team.team}</div>
                <div className="modal-odds-row">
                  <a className="modal-odds-chip" href={game.url} target="_blank" rel="noopener">
                    {team === game.top ? game.topOdds : game.bottomOdds}&cent;
                  </a>
                </div>
                <div className="modal-payout-box">
                  <div className="modal-payout-label">$100 bet if {team.abbr} wins</div>
                  <div className="modal-payout-amount">
                    {formatPayout(team === game.top ? game.topOdds : game.bottomOdds)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!gameOver && (
          <div className="modal-links">
            <a className="modal-link polymarket-link" href={game.url} target="_blank" rel="noopener">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Bet on Polymarket
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
