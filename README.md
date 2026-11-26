# tradeviw

A TradingView-class charting, analysis, and community platform — with **every feature free**.

Charting · 100+ indicators · 60+ drawing tools · a scripting language + backtester · screener · alerts · bar replay · news & fundamentals · ideas feed · paper trading.

> Status: **planning / Phase 0**. No product code yet.

## Why this can exist

- **Lightweight Charts** (TradingView's own open-source renderer) is Apache-2.0 — free for commercial use, with attribution. Advanced Charts / Trading Platform are proprietary and *not* licensed to individuals, so those are off the table.
- **Crypto data is free and real-time** via public exchange WebSockets. US equities are delayed on free tiers — so we badge data age honestly rather than pretending otherwise, and support bring-your-own-API-key for real-time.
- **Free to the user ≠ free to run.** The plan is funded by donations/sponsors/grants, never by paywalling a feature. There is deliberately no `plan` flag in the schema.

## Read the plan

- **[docs/ROADMAP.md](docs/ROADMAP.md)** — vision, architecture, feature parity matrix, 15 phases, timeline, costs, risk register.
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — Phase 0 decision log to fill in before coding.

## Phases at a glance

| # | Phase | Weeks |
|---|---|---|
| 0 | Decisions, legal, wireframes | 0.5–1 |
| 1 | Monorepo, design system, auth, deploy | 1–2 |
| 2 | Chart core | 3–4 |
| 3 | Data layer (ingest, store, stream) | 3–4 |
| 4 | Indicators & drawing tools | 3–4 |
| 5 | Scripting language + backtester | 5–6 |
| 6 | Watchlists, layouts, alerts, replay | 3–4 |
| 7 | Screener, heatmaps, multi-chart | 3–4 |
| 8 | News, fundamentals, calendars, symbol pages | 3 |
| 9 | Community: ideas, profiles, moderation | 4–5 |
| 10 | Paper trading & broker connects | 4–6 |
| 11 | Realtime scale hardening | 3–4 |
| 12 | Mobile, PWA, desktop | 4–5 |
| 13 | Quality, security, SEO, i18n, a11y | 2–3 |
| 14 | Launch, growth, sustainability | 2–3 |

MVP (M1) ≈ week 10–12. Public beta (M2) ≈ week 22–26. Full parity+ ≈ month 15–24.

## Not affiliated with TradingView

Independent project. No TradingView assets, brand, or data are used.
