# March Madness 2026

A bracket dashboard for the 2026 NCAA tournament, with Polymarket odds, estimated payout displays, and game-score updates.

[Open the dashboard](https://march-madness-prediction-market.vercel.app)

## Features

- Regional brackets and winner advancement.
- Matchup details with odds and links to corresponding markets.
- A live-game view when games are in progress.
- Periodic client refreshes for scores and market data.

## Data and freshness

The app is configured for the **2026 tournament**. It does not automatically create brackets for a new season.

[`app/api/odds/route.js`](app/api/odds/route.js) combines Polymarket's Gamma API with ESPN score data and an NCAA API fallback. [`lib/default-data.js`](lib/default-data.js) supplies the initial bracket and fallback values.

The server caches the combined response for 30 seconds per process. Refreshing it can make multiple upstream requests, and separate server instances maintain separate caches. Failed requests can leave fallback values in place; a rendered bracket alone does not prove every price or score is current.

## Run locally

With Node.js and npm installed, run from the repository root:

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The current public-data integrations do not require API keys.

## Production build

```bash
npm run build
npm start
```

No automated test or lint script is currently configured.

## Repository guide

| Path | Purpose |
| --- | --- |
| `app/page.js` | Bracket interface and client refreshes |
| `app/globals.css` | Styles |
| `app/api/odds/route.js` | Market and score aggregation |
| `lib/default-data.js` | Tournament structure and fallback data |

Built with Next.js and React. Market displays are estimates; the app does not execute trades.
