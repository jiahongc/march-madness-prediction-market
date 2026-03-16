# March Madness 2026 — Live Bracket with Polymarket Odds

**[View Live](https://march-madness-prediction-market.vercel.app)**

A live NCAA March Madness bracket dashboard showing Polymarket odds, $100 payout calculations, and live game scores.

## Features

- **Polymarket odds** with $100 payout calculator for every first-round matchup
- **Live NCAA scores** — in-progress scores, final results, period and game clock
- **Auto-refresh** — scores update every 60 seconds in the background
- **Live tab** — when bracket games are in progress, a dedicated live view appears with large score cards
- **Winner advancement** — completed games populate the next round automatically
- **Region tabs** — East, South, West, Midwest
- **Game detail modal** — click any matchup for expanded odds and direct Polymarket links

## How It Works

- **Odds** are sourced from [Polymarket](https://polymarket.com/sports/cbb/games)
- **Live scores** are fetched from the [NCAA API](https://github.com/henrygd/ncaa-api) (free, public)
- Server caches responses for 30 seconds — even with many concurrent users, at most 1 API call per 30 seconds
- When a game finishes, odds and payouts are replaced by the final score, and the winner advances to the next round

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No API keys required.

## Project Structure

```
app/
  layout.js            Root layout with metadata
  page.js              Main bracket page (client component)
  globals.css          All styling
  icon.svg             Favicon
  api/odds/route.js    API route — fetches and caches NCAA live scores
lib/
  default-data.js      Polymarket odds and links for all 32 first-round games
```

## Built With

[Next.js](https://nextjs.org) · [React](https://react.dev) · [Vercel](https://vercel.com)
