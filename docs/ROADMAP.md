# tradeviw — Build Roadmap

> A TradingView-class charting, analysis, and community platform where **every feature is free**.
> This document is the execution plan: scope, architecture, 15 phases, milestones, costs, and risks.

**Status:** planning · **Owner:** you · **Repo:** `Ovidhub/tradeviw`

---

## Table of contents

1. [Vision & success criteria](#1-vision--success-criteria)
2. [The three reality checks](#2-the-three-reality-checks-read-before-coding)
3. [What "free" actually means here](#3-what-free-actually-means-here)
4. [Architecture](#4-architecture)
5. [Recommended stack](#5-recommended-stack)
6. [Feature parity matrix](#6-feature-parity-matrix)
7. [The 15 phases](#7-the-15-phases)
8. [Milestones & timeline](#8-milestones--timeline)
9. [Cost model](#9-cost-model)
10. [Risk register](#10-risk-register)
11. [Working model & quality gates](#11-working-model--quality-gates)
12. [Next 10 actions](#12-next-10-actions)

---

## 1. Vision & success criteria

**One-liner:** the open, free alternative to TradingView — professional charting, indicators, scripting, screeners, alerts, paper trading, and a community ideas feed, with no paywall and no feature-gating.

**What we are NOT doing:** cloning TradingView's brand, logo, UI pixel-for-pixel, or scraping their data. We are competing on *capability and freedom*, not on copying assets.

### Success criteria (define these now, measure later)

| Metric | MVP target | v1 target | v2 target |
|---|---|---|---|
| Charts render smoothly | 60 fps @ 10k bars, 5 pan/zoom | 60 fps @ 50k bars | 60 fps @ 250k bars + 8 panes |
| Time-to-first-candle for a cold visitor | < 2.5 s | < 1.5 s | < 1 s |
| Indicators available | 25 | 100+ | 150+ incl. volume profile |
| Drawing tools | 15 | 60+ | 100+ |
| Uptime (WS + REST) | 99.0% | 99.5% | 99.9% |
| Symbols | 1 asset class | crypto + US equities + forex | + futures, indices, intl |
| Data freshness | free-tier acceptable | real-time where legally free | same + order flow |
| Lighthouse (desktop) | 85 | 92 | 95 |
| Public script count (community) | 0 | 500 | 10k |

### Explicit non-goals for year 1

- Broker-dealer licensing, regulated financial advice, KYC.
- Full Level 2 / depth-of-market for equities (costs real money on every provider).
- Native iOS/Android at launch (PWA first, wrap later).

---

## 2. The three reality checks (read before coding)

These three constraints determine 80% of the plan. Get them wrong and you rewrite the product.

### 2.1 Charting library licence

| Option | Licence | Verdict |
|---|---|---|
| **TradingView Lightweight Charts** | Apache-2.0 — free, commercial OK, attribution watermark required | ✅ **Start here.** 35–45 KB, canvas, performs well, TS types, good API for candles/line/area/histogram/volume + custom primitives. |
| TradingView Advanced Charts | Proprietary; **not licensed to individuals or hobby projects**, companies only | ❌ Cannot use. |
| TradingView Trading Platform | Proprietary; requires broker API integration | ❌ Cannot use. |
| Build our own renderer (Canvas 2D → WebGL) | Yours | 🔜 **Phase 2B / Phase 7.** Required eventually for panes, drawing engine, volume profile, order flow. |
| Apache ECharts / Highcharts Stock | Apache-2.0 / commercial | ⚠️ Generic viz libraries; weaker for financial interaction. Not a charting engine. |

**Decision:** ship MVP on Lightweight Charts behind a `ChartAdapter` interface, then swap in our own renderer when we hit its limits (multiple panes, drawing-tool persistence, volume profile). Keeping the adapter boundary is the single most important early architectural choice.

### 2.2 Data feeds — the honest truth

There is **no free, real-time, consolidated US equity feed**. Anyone who says otherwise is scraping (ToS violation) or selling you one exchange. Plan around that instead of pretending.

| Asset class | Truly free real-time? | Recommended free source | Limits (verify at signup) |
|---|---|---|---|
| **Crypto** | ✅ **Yes** | Binance / Bybit / Coinbase / Kraken **public WebSocket** (no key, real-time trades + klines) | Rate-limited but generous; no ToS problem for public market data |
| US equities | ⚠️ Delayed 15–20 min (real-time is IEX-only or paid) | Alpaca Markets (IEX, 200 req/min), Finnhub (60/min), Twelve Data (8/min, 800/day), FMP (250/day) | Snapshot caps; historical depth varies |
| Forex | ⚠️ Mostly delayed / indicative | Twelve Data, Finnhub, Frankfurter/ECB (daily refs) | Intraday forex free is thin |
| Indices / ETFs | ⚠️ Delayed | same as equities | Index licensing is restrictive — use ETF proxies (SPY/QQQ) |
| Fundamentals | ✅ Mostly free | FMP, Finnhub, SEC EDGAR full-text + Company Facts API, SEC XBRL | EDGAR is genuinely free and authoritative |
| News | ✅ Free | RSS/Atom ingesters + provider news endpoints; store headline+snippet only | Never store full article bodies |
| Economic calendar | ⚠️ Partial | Finnhub, Trading Economics (paid), FRED for macro series | FRED is free and excellent for macro |

**Decision:** lead with **crypto-first real-time** (it is the only class where "free + real-time" is truly achievable), and ship equities/forex as *delayed-but-honest*, clearly badged with data age. Also support **BYO-API-key mode** so power users can plug in their own provider key without us paying for it.

**Never:** scrape yahoo/tradingview/investing.com. It breaks constantly, violates ToS, and creates legal exposure once you have users.

### 2.3 Legal & brand

- Don't call it "TradingView", don't use their logo, icons, colour scheme, or copied screenshots. Own visual identity from day 1.
- Keep the Lightweight Charts attribution/watermark required by its licence (or remove it only per licence terms).
- Community posts = user-generated content → need ToS, privacy policy, DMCA/takedown process, moderation, and a disclaimer ("not financial advice") before Phase 9.
- If you ever add broker connect (Phase 10) that's a regulated activity in most jurisdictions — do paper trading first, integrate brokers via *their* established partnership/API programs only.
- Publish the repo under a licence (MIT/Apache-2.0 for your code) if "free forever" is the promise — that is the strongest possible guarantee and doubles as distribution.

---

## 3. What "free" actually means here

You are promising **free to the user**. You are not promising **free to operate**. Three honest funding models, and the plan works with any of them:

| Model | UX impact | Feasibility |
|---|---|---|
| **A. Free tier + delays** | All features unlocked; equities data has a visible delay badge | Best MVP path. Zero marginal cost at small scale. |
| **B. BYO key** | User pastes their own Finnhub/Alpaca key for real-time; we never pay | ✅ Ship in Phase 3. Zero cost, high power-user love. |
| **C. Donations / sponsors / OSS grants** | No feature gating, ever | Covers infra at modest scale ($20–200/mo) |
| *Avoid:* | ads, "pro" paywall, feature gating | Contradicts the promise; breaks trust |

Design rule that enforces the promise: **no `isPro` / `plan` flag anywhere in the schema.** Every feature is one code path. Free means architecturally free, not marketing-free.

---

## 4. Architecture

```
                         ┌──────────────────────────────────────────┐
   Browser (Next.js)     │  Chart engine (canvas/WebGL) + panes      │
   React 19 + TS         │  Drawing layer · Indicator engine         │
   Zustand + TanStack Q  │  Layout engine · Script runtime (WASM)    │
                         └───────────────┬──────────────────────────┘
                                         │ REST (history, search, meta)
                                         │ WS   (quotes, candles, alerts)
                         ┌───────────────▼──────────────────────────┐
                         │  API Gateway  (Fastify / Go)             │
                         │  auth · rate limit · schema validation   │
                         └───┬───────────┬───────────┬──────────────┘
                             │           │           │
                 ┌───────────▼──┐  ┌─────▼─────┐  ┌──▼─────────────┐
                 │ Timescale    │  │  Redis    │  │  WS Fan-out    │
                 │ (Postgres)   │  │ cache +   │  │  pub/sub nodes │
                 │ candles,     │  │ presence  │  │  (Redis Streams│
                 │ ticks, users │  │ + queues  │  │   / NATS)      │
                 └──────▲───────┘  └───────────┘  └──▲─────────────┘
                        │                             │
                 ┌──────┴─────────────────────────────┴─────────────┐
                 │  INGEST WORKERS (one per provider adapter)       │
                 │  Binance WS · Alpaca · Finnhub · EDGAR · RSS     │
                 │  → normalize → dedupe → gap-fill → resample      │
                 └──────────────────────┬───────────────────────────┘
                                        │
                 ┌──────────────────────▼───────────────────────────┐
                 │  JOBS: backfill, corporate actions, symbol sync, │
                 │  alert evaluation, screener refresh              │
                 └──────────────────────────────────────────────────┘
```

**Key architectural decisions (lock these in Phase 0):**

1. **Normalization boundary.** Every provider adapter emits the *same* `Candle` / `Quote` / `Trade` shapes. Nothing downstream knows which provider it came from.
2. **Server-side aggregation + resampling.** Providers give 1m; we build 5m/15m/1h/4h/1D, adjusted for splits/dividends. This is what makes 100+ symbols × 10 timeframes affordable.
3. **Read-optimized storage.** Timescale hypertable + continuous aggregates for OHLCV; plain Postgres tables for users/scripts/alerts. Raw ticks in object storage (S3/R2), not the DB.
4. **Indicators compute client-side** (WASM/native JS over Float64Array), server-side only for screener/backtest/alerts. One indicator library, two runtimes.
5. **Chart adapter interface** so the renderer is swappable (see 2.1).
6. **No feature flags for monetization** — only for rollout safety.

---

## 5. Recommended stack

| Layer | Pick | Why | Alternatives |
|---|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Fast, one lockfile, shared types | Nx |
| Frontend | Next.js 15 (App Router), React 19, TS strict | SSR/SEO for ideas & symbol pages | Vite + React Router |
| Styling | Tailwind + shadcn/ui + Radix | Accessible primitives, fast iteration | Mantine |
| Charts | Lightweight Charts → own renderer | See 2.1 | — |
| State | Zustand (chart/app) + TanStack Query (server) | Avoids Redux ceremony | Jotai |
| API | Fastify + Zod (TS) | Same language as FE, fast enough | Go/Fiber if ingest becomes the bottleneck |
| Realtime | Raw `ws` + Redis Streams fan-out | Simple, cheap, scalable to ~10k conns/node | NATS, Centrifugo |
| DB | Postgres 16 + TimescaleDB | OHLCV compression + time_bucket aggregates | ClickHouse at huge scale |
| Cache/queue | Redis (Upstash free tier → self-host) | Quotes, sessions, BullMQ jobs | NATS KV |
| Auth | Better-Auth / Auth.js + OAuth | Email+Google+GitHub, no vendor lock | Clerk (paid) |
| Scripting | Custom DSL → AST → bytecode, run in WASM sandbox | Safety + performance + TS/Python-like syntax | QuickJS, Rust+wasm |
| Jobs | BullMQ + a small worker dyno | Cron-equivalent without serverless timeouts | GitHub Actions cron |
| Observability | Sentry + OpenTelemetry + Grafana Cloud free | Errors, traces, metrics on free tiers | Better Stack |
| CI/CD | GitHub Actions + Vercel (web) + Fly.io/Hetzner (API/WS) | Free minutes, cheap VPS for WS | Railway |
| Mobile | PWA → Capacitor shell | One codebase; ship stores in v2 | React Native (rewrite cost) |

> **Vercel caveat:** the Hobby plan is for non-commercial use. If the site takes donations/ads, move to Pro (~$20/mo) or self-host Next.js next to the API. Plan for this in Phase 14, not as a surprise at launch.

---

## 6. Feature parity matrix

Priorities: **P0** = MVP-blocking, **P1** = v1, **P2** = v2+. Effort is dev-days for one experienced engineer.

### Charting
| Feature | Pri | Phase | Effort | Notes |
|---|---|---|---|---|
| Candlestick / hollow / bar / line / area / baseline | P0 | 2 | 8 | Lightweight Charts covers most |
| Volume histogram, separate pane | P0 | 2 | 3 | |
| Timeframes 1m–1M + custom | P0 | 2 | 4 | Server-side resampling |
| Pan/zoom/crosshair/OHLC legend | P0 | 2 | 5 | |
| Timezone handling (exchange vs local) | P0 | 2 | 2 | Store UTC, render localized |
| Symbol search + favourites | P0 | 2 | 4 | FTS on symbol metadata |
| Heikin Ashi / Renko / Kagi / P&F / Line break | P1 | 4 | 10 | Non-time-based bars = own aggregation |
| Multi-pane layouts (2/4/8) | P1 | 7 | 8 | Needs own renderer |
| Compare/second symbol overlay | P1 | 7 | 4 | % change normalization |
| Multi-chart layout + sync crosshair/time | P1 | 7 | 6 | |
| Bar replay (step, play, speed) | P1 | 6 | 8 | Cursor over stored history |
| Templates & saved layouts | P1 | 6 | 6 | JSON blobs |
| Volume profile / VPVR | P2 | 11 | 12 | Own renderer required |
| Order flow / footprint / tick charts | P2 | 12 | 25 | Needs tick data + paid feed |
| Second-based intervals, tick charts | P2 | 12 | 10 | |

### Indicators & studies
| Feature | Pri | Phase | Effort | Notes |
|---|---|---|---|---|
| 25 core (SMA, EMA, RSI, MACD, BB, ATR, Stoch, ADX, OBV, VWAP, Ichimoku…) | P0 | 4 | 15 | Pure functions over Float64Array |
| Indicator settings UI + per-instance params | P0 | 4 | 5 | |
| 100+ indicator library | P1 | 4 | 20 | Port/verify against reference values |
| Indicator values on crosshair + data window | P1 | 4 | 3 | |
| Server-side screening with indicators | P1 | 7 | 8 | Same lib, Node runtime |
| Divergence / multi-timeframe indicators | P2 | 11 | 10 | |

### Drawing tools
| Feature | Pri | Phase | Effort |
|---|---|---|---|
| Trendline, ray, H-line, V-line, rectangle, fib retracement, channel, text, arrow, brush, measure | P0 | 4 | 20 |
| Magnet/snap to OHLC, editing handles, undo/redo | P0 | 4 | 8 |
| Alerts on a drawing | P1 | 6 | 6 |
| 60+ tools (Gann, Elliott, pitchfork, patterns, positions) | P1/P2 | 11 | 30 |
| Persistence per symbol/timeframe + sharing | P1 | 4 | 5 |

### Scripting, backtesting
| Feature | Pri | Phase | Effort | Notes |
|---|---|---|---|---|
| DSL spec (syntax, types, series semantics) | P1 | 5 | 10 | Pine-like but our own design |
| Parser + type checker + interpreter | P1 | 5 | 25 | |
| Sandboxed execution (WASM, no network/fs, gas metering) | P1 | 5 | 10 | Non-negotiable for security |
| Plot/hline/fill/alert/output API | P1 | 5 | 8 | |
| Strategy backtester (fills, slippage, commission, equity curve, stats) | P1 | 5 | 20 | |
| Script editor (Monaco + hover + errors) | P1 | 5 | 10 | |
| Public script library, versioning, publishing | P1 | 9 | 15 | |
| Optimization/walk-forward, multi-symbol backtests | P2 | 11 | 20 | |

### Alerts, watchlists, workspace
| Feature | Pri | Phase | Effort |
|---|---|---|---|
| Watchlists (CRUD, drag order, multi-list) | P0 | 6 | 6 |
| Price/indicator/crossing alerts | P0 | 6 | 10 |
| Server-side alert evaluation + fan-out | P0 | 6 | 8 |
| Delivery: in-app, email, web push; webhook/Telegram (free channels) | P1 | 6 | 8 |
| Saved layouts, per-symbol settings memory | P1 | 6 | 4 |
| Portfolios / positions tracker (manual) | P1 | 6 | 6 |
| Keyboard shortcuts, command palette | P1 | 6 | 4 |
| Chart snapshots + share links | P1 | 9 | 6 |

### Discovery & market data
| Feature | Pri | Phase | Effort |
|---|---|---|---|
| Screener (filters, sort, saved screens) | P1 | 7 | 18 |
| Heatmaps (S&P sectors, crypto) | P1 | 7 | 10 |
| News feed + per-symbol news | P1 | 8 | 10 |
| Fundamentals panel (from EDGAR/ FMP) | P1 | 8 | 12 |
| Earnings / dividends / splits calendar | P1 | 8 | 8 |
| Economic calendar + macro (FRED) | P1 | 8 | 8 |
| Symbol detail pages (SEO) | P1 | 8 | 6 |

### Community & trading
| Feature | Pri | Phase | Effort |
|---|---|---|---|
| Ideas feed (posts with attached chart snapshot + symbol) | P1 | 9 | 15 |
| Comments, reactions, follows, notifications | P1 | 9 | 14 |
| Profiles, reputation, moderation + reporting | P1 | 9 | 12 |
| Paper trading (market/limit, P&L, history) | P2 | 10 | 20 |
| Broker/exchange connect (via partner APIs) | P2 | 10 | 30+ |
| Social sentiment / trending tickers | P2 | 10 | 10 |

### Platform
| Feature | Pri | Phase | Effort |
|---|---|---|---|
| Auth (email, OAuth), account settings, 2FA | P0 | 1 | 8 |
| Dark/light theme, responsive layout | P0 | 1 | 6 |
| Accessibility (keyboard nav, ARIA, contrast) | P0 | 1 + 13 | 8 |
| PWA (installable, offline shell, push) | P1 | 12 | 8 |
| Native iOS/Android shell | P2 | 12 | 20 |
| i18n (RTL-ready), number/locale formatting | P2 | 13 | 12 |
| Public API + webhooks for developers | P2 | 13 | 15 |

---

## 7. The 15 phases

Each phase has a goal, the work, and a **Definition of Done (DoD)** you can literally tick off. Phases 2 and 3 can run in parallel; so can 8 and 9.

---

### Phase 0 — Decisions, legal, and a paper prototype
**Duration:** 3–5 days · **Blocks:** everything

**Goal:** remove ambiguity so no later phase needs a rewrite.

- [ ] Pick the launch asset classes (recommend: crypto + US equities delayed).
- [ ] Lock the charting strategy: Lightweight Charts behind an adapter, own renderer later.
- [ ] Sign up for the free data providers and **record actual limits you observe** (not marketing copy): Alpaca, Finnhub, Twelve Data, FMP, FRED, EDGAR.
- [ ] Decide the licensing of our code (MIT or Apache-2.0) and the "free forever" wording in the README.
- [ ] Write the ToS + privacy disclaimer skeleton ("not financial advice", data-delay disclosure, UGC terms).
- [ ] Choose product name/domain + check trademark availability.
- [ ] Pick 3 competitor screenshots' *feature sets* to rival (not their pixels).
- [ ] Figma (or Excalidraw) wireframes: chart page, watchlist, screener, ideas feed.

**DoD:** a one-page decision doc (`docs/DECISIONS.md`) with every choice above, signed off by you. No TODOs left.

---

### Phase 1 — Foundations: monorepo, design system, auth, deploy
**Duration:** 1–2 weeks

**Goal:** the skeleton every later phase plugs into, deployed to production on day 1.

- [ ] pnpm + Turborepo monorepo: `apps/web`, `apps/api`, `apps/ws`, `apps/ingest`, `packages/core`, `packages/indicators`, `packages/types`, `packages/ui`, `packages/data-adapters`.
- [ ] TS strict everywhere, ESLint + Prettier, Vitest, Playwright, commit hooks, conventional commits.
- [ ] Shared `types` package: `Candle`, `Quote`, `Trade`, `Symbol`, `Timeframe`, `Interval` — the contract for the whole system.
- [ ] Next.js app shell: dark-first theme tokens, app layout, chart page placeholder, marketing landing page.
- [ ] Auth (email + Google + GitHub), session handling, protected routes, user table.
- [ ] Fastify API skeleton with OpenAPI/Zod schemas, health check, request logging, rate limiter.
- [ ] Postgres (+Timescale extension) via Docker Compose locally; CI runs migrations against a throwaway DB.
- [ ] GitHub Actions: lint → typecheck → test → build → deploy (web to Vercel, api to Fly/Hetzner).
- [ ] Sentry wired to web + api; basic product analytics (self-hosted Umami or PostHog free).
- [ ] ADRs for: adapter boundary, storage layout, indicator runtime.

**DoD:** a logged-in user can reach an empty chart page in production; CI is green; errors show up in Sentry; `docker compose up` gives a working local stack in one command.

---

### Phase 2 — Chart core (the product's heart)
**Duration:** 3–4 weeks

**Goal:** a chart that feels good at 10k bars and never blocks the main thread.

- [ ] `ChartAdapter` interface (renderer-agnostic): setData, appendBar, updateQuote, addSeries, addPane, setCrosshair, coordinate math, screenshot.
- [ ] Lightweight Charts implementation behind that interface.
- [ ] Candle/bar/line/area/baseline/hollow-candle series + volume pane.
- [ ] Symbol search (debounced, keyboard-navigable) + URL state: `/chart/BTCUSDT/1h`.
- [ ] Timeframe switcher with server-side resampling; correct UTC → exchange/local timezone rendering, DST-safe.
- [ ] Crosshair with OHLC + volume legend, price/time axes, log scale, percentage scale.
- [ ] Infinite scroll back in history (cursor pagination), prefetch on pan, loading skeletons.
- [ ] Smooth live updates: throttle to rAF, coalesce ticks per second, no layout thrash.
- [ ] Mobile touch: pinch-zoom, pan, long-press crosshair.
- [ ] Perf harness: 50k bars, measure frame time and memory; add a benchmark to CI.

**DoD:** 10k bars render at ~60 fps on a mid-range laptop and a 3-year-old Android; panning triggers no >100 ms long tasks; switching symbols keeps chart state (timeframe, scale) intact.

---

### Phase 3 — Data layer: ingest, normalize, store, stream
**Duration:** 3–4 weeks (parallelizable with Phase 2)

**Goal:** one reliable pipe from any provider to any client, with visible data freshness.

- [ ] Provider adapter interface + implementations: **Binance WS** (trades + klines), Alpaca (IEX), Finnhub, Twelve Data, FMP, FRED, SEC EDGAR.
- [ ] Normalizer: symbol mapping (`BTC/USDT` ↔ `BTCUSDT` ↔ Binance `BTCUSDT`), exchange codes, asset-class metadata.
- [ ] Ingest workers: reconnect w/ exponential backoff, heartbeat, sequence-gap detection, dedupe by trade id.
- [ ] Storage: Timescale hypertable for 1m candles + ticks to R2/S3; continuous aggregates for 5m/15m/1h/4h/1D; corporate-action adjustment (splits/dividends).
- [ ] Backfill jobs: on-demand history for a symbol/timeframe, chunked and idempotent, resumable.
- [ ] REST endpoints: `/symbols`, `/symbols/search`, `/candles`, `/quote`, `/meta` — versioned, cached, ETagged.
- [ ] WebSocket gateway: subscriptions (symbol+timeframe), backpressure, per-connection caps, reconnect + resume-from-cursor.
- [ ] Redis caching with TTL tiers (quote 1 s, candles per timeframe).
- [ ] **BYO-key mode:** user-supplied provider key stored encrypted, used only for their requests.
- [ ] Data-health dashboard: last tick per symbol, gap alarms, provider error rates.
- [ ] **Data-age badge in the UI** everywhere prices appear (feeds the honesty promise).

**DoD:** BTC real-time over WS with <1 s end-to-end lag; any symbol/timeframe cold-loads <500 ms from cache; killing a provider socket self-heals in <30 s with no gaps; a 5-year 1m backfill completes unattended.

---

### Phase 4 — Indicators & drawing tools
**Duration:** 3–4 weeks

**Goal:** the analysis surface users actually live in — and it must be *correct*, not just present.

- [ ] Indicator runtime in `packages/indicators`: pure functions over `Float64Array`, typed params, incremental (stateful) variants for live updates.
- [ ] 25 P0 indicators verified against reference values (golden-file tests: TV/Wikipedia/Excel numbers).
- [ ] Renderer hooks: line, histogram, band fill, markers, multi-pane, per-indicator colours/thickness.
- [ ] Indicator picker UI (search, favourites), settings dialog, add/remove/reorder, per-symbol persistence.
- [ ] Data window / legend values on crosshair; indicator visibility toggles.
- [ ] Drawing layer: 15 tools — trendline, ray, horizontal, vertical, rectangle, ellipse, fib retracement, fib extension, parallel channel, text, arrow, brush, measure, price range, long/short position.
- [ ] Selection, handles, drag/resize/rotate, magnet snap to OHLC, undo/redo stack, delete, lock/hide.
- [ ] Drawing persistence: `{symbol, timeframe, tool, points, style}` JSON, autosaved per user + symbol.
- [ ] Copy/paste, duplicate, z-order, per-drawing colour/opacity/line style.
- [ ] Golden visual regression tests (Playwright screenshots).

**DoD:** 25 indicators match reference values to tolerance on 3 datasets; 15 drawing tools survive reload and symbol switches; undo/redo works across 50 operations; keyboard-only users can add an indicator, draw a trendline, and delete it.

---

### Phase 5 — Scripting language + backtester
**Duration:** 5–6 weeks · **Highest-risk phase — do not start before Phase 2–4 are solid**

> **Priority override (this build).** The backtester is the product's most important
> tool, so the *engine* was pulled forward into Phase 1 and now runs on real data.
> What remains in this phase is the scripting language, the visual strategy builder,
> and the server-side scale-out. See `docs/BACKTESTER.md` for what shipped.

**Goal:** the feature that makes "free TradingView" actually compelling: users write, publish, and backtest their own studies and strategies.

- [ ] Spec `TradeLang`: series-first types, `ta.*` builtins, `input()`, `plot()`, `hline()`, `fill()`, `alert()`, `strategy.*`, `if/else`, loops with gas limits.
- [ ] Lexer → parser → AST → type checker (units: series vs scalar vs bool) with helpful error messages + line/col.
- [ ] Compiler → bytecode; interpreter in a **WASM sandbox** (no fetch, no fs, deterministic, instruction budget) so a hostile script can't damage us.
- [ ] Incremental execution against live bars (recompute only on close unless `calc_on_every_tick`).
- [ ] Backtest engine: order intents → fills with slippage/commission/leverage/margin, position sizing, equity curve, drawdown, Sharpe/Sortino/win-rate/profit-factor, trade list + export CSV.
- [ ] Editor: Monaco with syntax highlighting, autocomplete for builtins, inline errors, run (web worker), save, version history.
- [ ] Script gallery: publish, fork, like, report; scripts run in the sandbox with content-addressed versions.
- [ ] Docs site for the language (this is what makes users stay).
- [ ] Fuzz + differential tests; a "dangerous script" test suite proving the sandbox holds.

**DoD:** 30 example scripts (SMA cross, RSI divergence, breakout, DCA, trailing stop) run identically in chart, screener, and backtester; infinite-loop and memory-bomb scripts are killed within budget; backtest of 5 years of 1h data finishes <3 s.

---

### Phase 6 — Watchlists, layouts, alerts, replay, portfolios
**Duration:** 3–4 weeks

**Goal:** turn a chart viewer into a daily-use workspace.

- [ ] Watchlists: multiple lists, drag-drop ordering, inline sparkline + % change, bulk add, import CSV.
- [ ] Alert engine: price / % change / indicator condition / drawing-cross; server-side evaluation on every bar close and tick; dedupe + cooldown; history log.
- [ ] Delivery: in-app notification centre, email (Resend free tier), web push (VAPID), Telegram/webhook; per-alert channel config.
- [ ] Saved layouts & templates: chart layout, indicator set, drawing theme; default-on-open; share via link.
- [ ] Bar replay: play/pause/step/speed, jumps, hidden-future guard.
- [ ] Manual portfolio tracker: positions, avg cost, P&L, allocation donut; optional public profile.
- [ ] Keyboard shortcuts + command palette (`⌘K`): symbol, timeframe, indicator, layout.
- [ ] Multi-monitor-friendly URL state so two tabs = two charts.

**DoD:** alert fires within 5 s of the condition on a live feed, exactly once, to two channels; layout restores after logout/login on another device; replay cannot leak future candles (verified by test).

---

### Phase 7 — Screener, heatmaps, multi-chart
**Duration:** 3–4 weeks

- [ ] Screener engine: indicator-based filters computed server-side, incremental refresh, saved screens, shareable URLs.
- [ ] Screener UI: sortable virtualized table, filter builder, column chooser, CSV export.
- [ ] Heatmaps: sectors/industries for equities, categories for crypto, treemap canvas with drill-down.
- [ ] Multi-chart workspace: 1/2/4/6/8 grid, independent symbols, synced crosshair & time range, drag-to-swap.
- [ ] Compare overlay (up to 5 symbols, % normalized) + spread/ratio charts.
- [ ] Move to own renderer here if multi-pane on Lightweight Charts is fighting us (evaluate at start of phase).
- [ ] Cron: nightly snapshot for all screenable symbols so first paint is instant.

**DoD:** screener over 5,000 symbols returns filtered results <400 ms; 8-pane grid keeps 30 fps; heatmap of 500 tiles renders <1 s.

---

### Phase 8 — News, fundamentals, calendars, symbol pages
**Duration:** 3 weeks

- [ ] News ingest: provider APIs + RSS; dedupe by title hash; symbol tagging via ticker/entity matching; store headline + snippet + link only.
- [ ] News UI: global feed, per-symbol feed, filters by source/sentiment, infinite scroll.
- [ ] Fundamentals panel: income/balance/cash-flow (EDGAR XBRL or FMP), key ratios, valuation, growth, dividend history.
- [ ] Earnings calendar, dividend/split calendar, economic calendar (macro events + FRED series charts).
- [ ] Symbol detail pages, SSR/SEO optimized: chart snapshot, key stats, related news, ideas, structured data (JSON-LD).
- [ ] Watchlist "today" digest email (opt-in).

**DoD:** every listed symbol has an indexable page with <2 s LCP; fundamentals load for 95% of US tickers; news for a symbol appears within 5 min of publication.

---

### Phase 9 — Community: ideas, profiles, moderation
**Duration:** 4–5 weeks

- [ ] Ideas: create post with attached chart (symbol + timeframe + drawings snapshot), rich text (sanitized), images, drafts.
- [ ] Feed: following / latest / trending ranking, cursor pagination, optimistic UI.
- [ ] Comments (threaded), reactions, follows, mentions, notification fan-out.
- [ ] Profiles: bio, stats, published scripts, ideas, followers; public/private.
- [ ] Reputation + badges based on real contributions (not vanity).
- [ ] Moderation: report, rate limits, shadowban, admin queue, banned-word/spam heuristics, audit log.
- [ ] Legal: ToS acceptance, DMCA/takedown flow, "not financial advice" banners, content licence grant.
- [ ] Snapshot service: server-side chart image render (headless canvas) for shares/OG cards.

**DoD:** a post with a chart renders an OG image for social sharing; spam burst of 100 posts is rate-limited and caught by the queue; takedown request handled via documented workflow.

---

### Phase 10 — Paper trading & broker integrations
**Duration:** 4–6 weeks

- [ ] Paper trading engine: orders (market/limit/stop/trailing), fills from live quotes, positions, P&L, margin checks, order history, reset.
- [ ] Strategy-to-paper bridge: run a published strategy in a paper account.
- [ ] Contests/leaderboards (optional, seasonal).
- [ ] Broker/exchange connections **only via official partner/OAuth programs**, order routing to the broker, never holding funds.
- [ ] Compliance review of wording and flows before shipping anything touching real money.

**DoD:** paper fills match expected price within slippage model; a broker sandbox order round-trips end-to-end; legal review signed off.

---

### Phase 11 — Realtime scale & performance hardening
**Duration:** 3–4 weeks (overlaps late phases)

- [ ] Horizontal WS fan-out: N nodes, Redis Streams, sticky-free subscriptions, graceful deploy drain.
- [ ] Load test: 10k concurrent sockets, 1k updates/s; document breaking points.
- [ ] Backpressure + conflation (send latest state, not a backlog) per subscription.
- [ ] Candle pipeline throughput tuning; batch writes; compression (zstd) on history responses.
- [ ] Cache hierarchy: CDN (Vercel edge) → Redis → DB; s-maxage per endpoint.
- [ ] Rate limiting per user/IP/key; abuse protection on search and scripting endpoints.
- [ ] Cost alarms; per-endpoint latency SLOs in Grafana.

**DoD:** 10k concurrent clients with p99 tick latency <300 ms on ≤3 small nodes; deploy causes zero dropped sessions; monthly cost stays within budget at 10k MAU.

---

### Phase 12 — Mobile, PWA, desktop
**Duration:** 4–5 weeks

- [ ] PWA: installable, offline shell, cached watchlists, push notifications.
- [ ] Mobile-first chart UX: touch gestures, bottom sheets, condensed toolbars, performance budget on low-end Android.
- [ ] Capacitor wrapper for App Store/Play (if desired), deep links, push, biometric auth for app lock.
- [ ] Optional Electron/Tauri desktop app with global shortcuts and multi-window.

**DoD:** Lighthouse PWA pass; chart at 30 fps on a $150 Android; app-store builds reproducible in CI.

---

### Phase 13 — Quality, security, SEO, i18n, accessibility
**Duration:** 2–3 weeks (cross-cutting, run continuously)

- [ ] Security: OWASP top-10 review, CSP, secure headers, dependency audit, secret scanning, pen-test of the script sandbox and auth.
- [ ] Data protection: GDPR/CCPA — export & delete account, cookie consent, DPA-ready logging.
- [ ] Accessibility: WCAG 2.2 AA audit (contrast, focus order, screen-reader landmarks, reduced motion).
- [ ] i18n: ICU message extraction, locale-aware numbers/dates, RTL layout support.
- [ ] SEO: sitemaps, canonical URLs, JSON-LD, symbol/idea page optimization.
- [ ] Docs: user guide, scripting reference, API docs, self-hosting guide, contributing guide.
- [ ] Observability: SLOs, alerting on ingest lag and WS error rate, on-call runbook.
- [ ] Backups + restore drill (test it, don't assume it).

**DoD:** zero high/critical vulns; a11y audit passes AA on core flows; restore-from-backup verified within RTO.

---

### Phase 14 — Launch, growth, sustainability
**Duration:** 2–3 weeks + ongoing

- [ ] Public beta → launch checklist: status page, support inbox, changelog, onboarding tour, sample layouts.
- [ ] Open-source the repo (if that's the promise) with a clean history, CONTRIBUTING, issue templates, self-hosting docs.
- [ ] Make "free forever" structurally credible: public roadmap, no paywall code paths, published costs.
- [ ] Distribution: SEO symbol pages, script gallery, share cards, Show HN / r/algotrading / crypto communities.
- [ ] Funding: GitHub Sponsors/Open Collective, grants (crypto OSS grants fit the crypto-first angle), optional low-cost hosted instance while self-host stays free.
- [ ] Feedback loop: in-app feedback, public issue voting, monthly release cadence.

**DoD:** public launch with a status page and support process; costs documented publicly; a stranger can self-host from the README in under 30 minutes.

---

## 8. Milestones & timeline

Assumes **1 strong full-stack dev + part-time designer**, 25–30 h/week. Multiply by ~0.6 for two devs in parallel, ~0.35 for three.

| Milestone | Phases | Calendar | What ships |
|---|---|---|---|
| **M0 — Foundations** | 0–1 | Week 2 | Deployed skeleton, auth, CI, type contracts |
| **M1 — MVP (public alpha)** | 2–4 | Week 10–12 | Real charts, real (delayed/crypto) data, 25 indicators, 15 drawings, symbol search — **usable daily** |
| **M2 — v1.0 (public beta)** | 5–7 | Week 22–26 | Scripting + backtester, watchlists, alerts, replay, screener, heatmaps, multi-chart |
| **M3 — v1.5 (community)** | 8–9 | Week 30–34 | News, fundamentals, calendars, ideas feed, profiles, moderation, SEO |
| **M4 — v2.0 (platform)** | 10–12 | Month 9–12 | Paper trading, broker connects, mobile/PWA, scale hardening |
| **M5 — Maturity** | 13–14 | Month 12–15 | Hardening, i18n, OSS release, sustainable ops |
| **Full parity+** | 11–12 extras | Month 15–24 | Volume profile, order flow, tick charts, advanced optimization |

**Cut lines:** if time is short, ship M1 without drawings and M2 without backtester — *never* without data correctness and the data-age badge.

### Dependency graph (what actually blocks what)

```
P0 ─▶ P1 ─▶ P2 ─┐
        └─▶ P3 ─┴─▶ P4 ─┬─▶ P5 ─┬─▶ P9 ─▶ P10
                          ├─▶ P6 ─┘
                          └─▶ P7 ─▶ P8
                                   P11 (after P3)
                                   P12 (after P7)
                                   P13 (continuous)
                                   P14 (after M2)
```

---

## 9. Cost model

Free-tier budget at MVP/alpha (~1k users). Verify current limits — they change.

| Item | Free tier | Cost after free tier |
|---|---|---|
| Vercel web (Hobby) | 100 GB bandwidth | ~$20/mo Pro — **required if commercial** |
| API + WS (Fly.io / Hetzner CX22) | — (Fly is paid now) | $5–15/mo per small node |
| Postgres + Timescale (Neon/Supabase free) | 0.5 GB / 500 MB | $19–25/mo at ~10 GB |
| Redis (Upstash free) | 10k cmds/day | $10/mo |
| Object storage (Cloudflare R2) | 10 GB free + no egress fees | $0.015/GB |
| Market data | Free tiers + BYO keys | **$0** (or user-funded) |
| Email (Resend free) | 3k/mo | $20/mo |
| Sentry/Grafana/PostHog free | gener generous caps | $0–30 |
| Domain + TLS | — | ~$15/yr |
| **Realistic monthly total** | | **$0–15 at alpha → $60–120 at 10k MAU** |

Sustainability target: cover with GitHub Sponsors/Open Collective at ~50 recurring donors, *without* gating a single feature.

---

## 10. Risk register

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | Free data tiers change or vanish | High | High | Multi-provider adapters + BYO key + crypto-first + caching; treat providers as swappable from day 1 |
| R2 | Lightweight Charts can't do panes/drawings/volume profile | High | Medium | `ChartAdapter` boundary; budget own renderer at Phase 7 |
| R3 | Script sandbox escape / abuse | Critical | Medium | WASM isolation, no network, instruction budget, fuzzing, pen-test, rate limits |
| R4 | Scope creep vs "every feature" | High | Certain | Phased cut lines, public roadmap, P0/P1/P2 discipline, ship weekly |
| R5 | Legal exposure from data/UGC | High | Medium | No scraping, licensed APIs only, ToS + DMCA + disclaimers before Phase 9 |
| R6 | Realtime costs explode | Medium | Medium | Conflation, resampling server-side, cache tiers, per-connection caps, cost alarms |
| R7 | Solo-dev burnout | High | High | Weekly releases, ruthless cut lines, OSS contributions, no paywall to maintain |
| R8 | TradingView trademark/brand confusion | Medium | Low | Own name/identity, no copied UI assets, clear independence statement |
| R9 | Historical data gaps/corporate actions wrong | High | Medium | Validation jobs, gap detectors, split/dividend adjustment tests, cross-provider diffing |
| R10 | Indicator math wrong → users lose money | High | Medium | Golden-value tests against published references, disclaimers, versioned formulas |

---

## 11. Working model & quality gates

**Cadence:** weekly demo, continuous deploy of web, bi-weekly API releases, one public changelog entry per week from M1.

**Every PR must pass:**
- typecheck + lint + unit tests (Vitest) + affected e2e (Playwright)
- performance budget check for chart-touching changes (frame time, bundle size)
- new market data or indicator code ships with fixture-based tests
- docs updated for user-facing features

**Test pyramid targets:** 70% unit (pure indicator/series logic is easy to test), 20% integration (API + DB), 10% e2e (chart flows). Visual regression on charts + drawings.

**Definition of "done" for any feature:** user-facing (works on mobile + keyboard), tested, documented, telemetry added, no paywall flag, and it degrades gracefully when a data feed is down.

---

## 12. Next 10 actions

1. Run Phase 0 and write `docs/DECISIONS.md`.
2. Create the provider accounts and log real observed limits.
3. Scaffold the monorepo and the shared `types` package.
4. Ship auth + a deployed empty chart page (Phase 1 DoD).
5. Implement `ChartAdapter` and render one live Binance candle series.
6. Build the Timescale schema + Binance ingest worker.
7. Add REST `/candles` + WS subscription with reconnect.
8. Add the first 5 indicators with golden tests.
9. Add 5 drawing tools with persistence.
10. Ship the public alpha behind a `/beta` link and start a changelog.

---

*Live document. Update the milestone table as phases complete; log every deviation from plan in `docs/DECISIONS.md`.*
