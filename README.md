# March Madness 2026 — Live Bracket with Polymarket Odds

A live NCAA March Madness bracket dashboard showing Polymarket odds, $100 payout calculations, and live game scores. Built with Next.js, deployed on Vercel.

## Features

- **Polymarket odds** with $100 payout calculator for every first-round matchup
- **Live NCAA scores** — in-progress scores, final results, period and game clock
- **Auto-refresh** — scores update every 60 seconds in the background
- **Live tab** — when bracket games are in progress, a dedicated live view appears with large score cards
- **Winner advancement** — completed games populate the next round automatically
- **30-second server cache** — prevents excessive API calls across all users
- **Region tabs** — East, South, West, Midwest
- **Game detail modal** — click any matchup for expanded odds and direct Polymarket links
- **No API keys required** — all data sources are public

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Vercel auto-detects Next.js — no config needed
4. No API keys or environment variables required

## How It Works

- **Odds** are sourced from [Polymarket](https://polymarket.com/sports/cbb/games) (static, updated in code)
- **Live scores** are fetched from the [NCAA API](https://github.com/henrygd/ncaa-api) (free, public, 5 req/sec)
- The server caches responses for 30 seconds — even with many concurrent users, at most 1 NCAA API call per 30 seconds
- When a game finishes, odds and payouts are replaced by the final score, and the winner advances to the next round

## Project Structure

```
app/
  layout.js            Root layout with metadata
  page.js              Main bracket page (client component)
  globals.css          All styling (light mode)
  icon.svg             Favicon
  api/odds/route.js    API route — fetches and caches NCAA live scores
lib/
  default-data.js      Polymarket odds and Polymarket links for all 32 first-round games
```
