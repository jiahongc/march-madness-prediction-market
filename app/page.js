"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { DEFAULT_REGIONS } from "../lib/default-data";

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

// ── Shared sub-components ────────────────────────────────
function SeedBadge({ seed }) {
  return <span className={`seed ${seedClass(seed)}`}>{seed}</span>;
}

// ── Main Component ───────────────────────────────────────
export default function BracketPage() {
  const [apiData, setApiData] = useState({
    regions: DEFAULT_REGIONS,
    lastUpdated: null,
    liveGames: 0,
    finalGames: 0,
    cached: false,
    cacheAge: 0,
    cacheTTL: 30,
  });
  const [currentRegion, setCurrentRegion] = useState("east");
  const [modalGame, setModalGame] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const prevLiveCount = useRef(0);

  // Detect mobile viewport
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
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
          cached: data.cached,
          cacheAge: data.cacheAge,
          cacheTTL: data.cacheTTL,
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

  const { regions, lastUpdated, liveGames: liveCount, finalGames: finalCount, cached, cacheAge, cacheTTL } = apiData;

  // Collect live games across all regions (memoized)
  const liveGames = useMemo(() => {
    const result = [];
    for (const [regionKey, regionData] of Object.entries(regions)) {
      for (const game of regionData.round1) {
        if (isLive(game)) {
          result.push({ ...game, regionName: regionKey });
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
  const games = isLiveView ? [] : regions[currentRegion].round1;

  // Build advancement for later rounds (memoized, skipped on live view)
  const { round2, round3, round4 } = useMemo(() => {
    if (isLiveView) return { round2: [], round3: [], round4: [] };
    const r2 = buildNextRound(games);
    const r3 = buildNextRound(matchupsToGames(r2));
    const r4 = buildNextRound(matchupsToGames(r3));
    return { round2: r2, round3: r3, round4: r4 };
  }, [games, isLiveView]);

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
              <h1>March Madness 2026</h1>
              <p className="subtitle">Bracket with Polymarket Odds · Odds as of Mar 16, 2026</p>
            </div>
          </div>
        </div>
      </header>

      {lastUpdated && (
        <div className="status-bar">
          <span className={`status-dot ${liveCount > 0 ? "live" : "stale"}`} />
          {liveCount > 0 ? (
            <span className="source-tag ncaa-tag">{liveCount} bracket {liveCount === 1 ? "game" : "games"} live</span>
          ) : finalCount > 0 ? (
            `${finalCount} bracket ${finalCount === 1 ? "game" : "games"} completed today`
          ) : (
            "No bracket games in progress"
          )}
          {cached && (
            <span className="cache-badge">cached ({cacheAge}s / {cacheTTL}s)</span>
          )}
          <span className="status-time">Updated {lastUpdated.toLocaleTimeString(undefined, { timeZoneName: "short" })}</span>
        </div>
      )}

      <div className="region-selector">
        {["east", "south", "west", "midwest"].map((r) => (
          <button key={r} className={`region-btn ${currentRegion === r ? "active" : ""}`} onClick={() => setCurrentRegion(r)}>
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
        {liveGames.length > 0 && (
          <button className={`region-btn live-tab ${currentRegion === "live" ? "active" : ""}`} onClick={() => setCurrentRegion("live")}>
            <span className="live-tab-dot" />
            Live ({liveGames.length})
          </button>
        )}
      </div>

      <main id="bracket-main">
        {isLiveView ? (
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
              <div className="round-label">First Round</div>
              {games.map((game, i) => (
                <div key={i} style={{ flex: 1, display: "flex", alignItems: "center" }}>
                  <MatchupCard game={game} onClick={() => setModalGame(game)} />
                </div>
              ))}
            </div>

            <ConnectorCol count={4} flex={2} />

            <div className="round-col">
              <div className="round-label">Second Round</div>
              {round2.map((matchup, i) => (
                <div key={i} style={{ flex: 2, display: "flex", alignItems: "center" }}>
                  {matchup ? <AdvancedSlot matchup={matchup} /> : <div className="future-slot">TBD</div>}
                </div>
              ))}
            </div>

            <ConnectorCol count={2} flex={4} />

            <div className="round-col">
              <div className="round-label">Sweet 16</div>
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
              <div className="round-label">Elite 8</div>
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

// ── Connector Column ────────────────────────────────────
const ConnectorCol = memo(function ConnectorCol({ count, flex }) {
  return (
    <div className="connector-col">
      <div className="round-label">&nbsp;</div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="conn-group" style={{ flex }}>
          <svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}>
            <line x1="0" y1="25%" x2="50%" y2="25%" stroke="var(--connector)" strokeWidth="1.5" />
            <line x1="0" y1="75%" x2="50%" y2="75%" stroke="var(--connector)" strokeWidth="1.5" />
            <line x1="50%" y1="25%" x2="50%" y2="75%" stroke="var(--connector)" strokeWidth="1.5" />
            <line x1="50%" y1="50%" x2="100%" y2="50%" stroke="var(--connector)" strokeWidth="1.5" />
          </svg>
        </div>
      ))}
    </div>
  );
});

// ── Advanced Slot ────────────────────────────────────────
function AdvancedSlot({ matchup }) {
  if (matchup.decided) {
    return (
      <div className="advanced-slot decided">
        <div className="advanced-team">
          <SeedBadge seed={matchup.top.seed} />
          <span className="tname">{matchup.top.team}</span>
        </div>
        <div className="advanced-vs">vs</div>
        <div className="advanced-team">
          <SeedBadge seed={matchup.bottom.seed} />
          <span className="tname">{matchup.bottom.team}</span>
        </div>
      </div>
    );
  }

  const known = matchup.top || matchup.bottom;
  return (
    <div className="advanced-slot partial">
      <div className="advanced-team">
        {known ? (
          <>
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

  function teamRowClass(isWinner, isLoser, isFav) {
    if (gameOver) return isWinner ? "winner" : "loser";
    return isFav ? "favorite" : "";
  }

  const topPct = game.topOdds;
  const botPct = game.bottomOdds;

  return (
    <div className={`matchup ${gameOver ? "matchup-final" : ""}`} onClick={onClick}>
      <div className={`team-row ${teamRowClass(topWon, botWon, topPct > botPct)}`}>
        <SeedBadge seed={game.top.seed} />
        <span className="tname">{game.top.team}</span>
        {gameOver ? (
          <span className="final-score">{game.liveScore.topScore}</span>
        ) : topPct ? (
          <a className={`odds-badge ${oddsClass(topPct)}`} href={game.url} target="_blank" rel="noopener" title="Bet on Polymarket" onClick={(e) => e.stopPropagation()}>
            {Math.round(topPct)}%
          </a>
        ) : null}
      </div>
      <div className={`team-row ${teamRowClass(botWon, topWon, botPct > topPct)}`}>
        <SeedBadge seed={game.bottom.seed} />
        <span className="tname">{game.bottom.team}</span>
        {gameOver ? (
          <span className="final-score">{game.liveScore.bottomScore}</span>
        ) : botPct ? (
          <a className={`odds-badge ${oddsClass(botPct)}`} href={game.url} target="_blank" rel="noopener" title="Bet on Polymarket" onClick={(e) => e.stopPropagation()}>
            {Math.round(botPct)}%
          </a>
        ) : null}
      </div>

      {!gameOver && (
        <>
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

      {gameLive && (
        <div className="live-score-bar in-progress">
          <span className="live-score-status">{formatClock(game.liveScore)}</span>
          <span className="live-score-numbers">
            {game.top.abbr} {game.liveScore.topScore ?? "-"} — {game.liveScore.bottomScore ?? "-"} {game.bottom.abbr}
          </span>
        </div>
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
          <SeedBadge seed={game.top.seed} />
          <span className="live-card-name">{game.top.team}</span>
          <span className="live-card-score">{score.topScore ?? "-"}</span>
        </div>
        <div className={`live-card-team ${botScore > topScore ? "leading" : ""}`}>
          <SeedBadge seed={game.bottom.seed} />
          <span className="live-card-name">{game.bottom.team}</span>
          <span className="live-card-score">{score.bottomScore ?? "-"}</span>
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
              <span className="modal-final-points">{game.liveScore.topScore}</span>
            </div>
            <div className={`modal-final-team ${winner?.abbr === game.bottom.abbr ? "modal-winner" : "modal-loser"}`}>
              <span className="modal-final-name">{game.bottom.team}</span>
              <span className="modal-final-points">{game.liveScore.bottomScore}</span>
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
