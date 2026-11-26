# tradeviw

A TradingView-class charting, analysis, and community platform — with **every feature free**.

**Status: Phase 1 complete.** Live candlestick chart on real market data + a full backtesting engine, running in the browser and on the CLI.

![no paywall](https://img.shields.io/badge/paywall-none-2dd4a7) ![license](https://img.shields.io/badge/license-MIT-blue) ![tests](https://img.shields.io/badge/tests-49%20passing-2dd4a7)

## What works right now

- **Real market data** — Binance public REST, no API key, no cost. Browser fetches directly (CORS-enabled) so there is no proxy to pay for.
- **Candlestick chart** — pan/zoom, crosshair, volume pane, SMA overlay, buy/sell markers on every backtest trade.
- **Backtesting engine** — bar-by-bar, **no lookahead**, fees and slippage on both sides, gap-aware stops, trailing stops, 4 sizing models, leverage cap.
- **6 reference strategies** — SMA cross, EMA + ATR, Donchian breakout, RSI mean reversion, MACD trend, buy & hold benchmark.
- **Full metrics** — equity curve vs benchmark, drawdown chart, Sharpe, Sortino, Calmar, profit factor, expectancy, trade blotter with exit reasons.
- **Honest data badges** — LIVE / DELAYED / SYNTHETIC is always visible. A synthetic fallback is labelled as such and never presented as a live feed.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:3000
npm test           # 49 tests
npm run demo       # backtest 3000 bars of BTCUSDT 4h from the terminal
```

CLI options:

```bash
npm run demo -- --symbol ETHUSDT --tf 1h --bars 5000
npm run demo -- --offline            # deterministic synthetic data, no network
npm run demo -- --json               # machine-readable output for CI
```

## Repository layout

```
packages/core/          the shared contract: types, bars, indicators, backtest engine, data adapters
  src/types.ts            Candle / SymbolInfo / DataProvider — the boundary every provider plugs into
  src/backtest/           engine, metrics, strategy library
  src/indicators/         pure indicator math (SMA/EMA/RSI/MACD/BB/ATR/OBV/VWAP/Donchian…)
  src/data/               Binance REST adapter + deterministic synthetic generator
apps/web/               Next.js app: chart, backtest console, worker
scripts/backtest-demo.ts  CLI
docs/ROADMAP.md         15-phase plan, architecture, costs, risks
docs/BACKTESTER.md      how the backtester works and what it deliberately won't do
docs/DECISIONS.md       Phase 0 decision log
```

## Design commitments

1. **No paywall code path.** No `isPro`, no `plan`, no feature flag for monetisation. Free is architectural, not marketing.
2. **No lookahead, ever.** A signal fills on the next bar. Enforced by the engine and pinned by tests.
3. **Pessimistic fills.** Gaps fill at the open; when a bar spans stop and target, the stop wins by default.
4. **Data provenance is always visible.** Synthetic data cannot masquerade as live.
5. **Benchmark everything.** Every result is shown against buy & hold, because most strategies lose to it.

## Why this can exist

- **Lightweight Charts** is Apache-2.0 — free for commercial use (attribution retained). TradingView's Advanced Charts are proprietary and not licensed to individuals, so they are off the table.
- **Crypto data is free and real-time** via public exchange APIs. US equities on free tiers are 15–20 min delayed, so they will ship with a visible data-age badge rather than a pretence of real-time.
- **Free to the user ≠ free to run.** Funded by donations/sponsors/grants, never by gating a feature. Realistic cost: $0–15/mo at alpha.

## Roadmap

| # | Phase | Status |
|---|---|---|
| 0 | Decisions, legal, wireframes | ✅ |
| 1 | Monorepo, chart core, data layer, **backtester** | ✅ |
| 2 | Indicators & drawing tools | next |
| 3 | Equities/forex providers, storage, streaming | |
| 4 | Scripting language (`TradeLang`) | |
| 5 | Parameter optimisation, walk-forward, portfolio backtests | |
| 6–14 | Watchlists, alerts, screener, news, community, paper trading, mobile, launch | |

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full 15-phase plan with effort estimates, milestones, cost model, and risk register.

## Not affiliated with TradingView

Independent project. No TradingView assets, brand, or data are used.

## License

MIT
