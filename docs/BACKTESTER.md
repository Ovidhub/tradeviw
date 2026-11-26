# The Backtester

> The most important tool in tradeviw, pulled forward into Phase 1 at the product
> owner's request. This document is the reference for what it does, what it
> deliberately does *not* do, and how to verify it.

---

## Why it is first, not fifth

Every free charting site can show you candles. Almost none will let you test an
idea against real data without a paywall, and the ones that do usually hide the
assumptions. A backtester's value is entirely in its **honesty about the
assumptions** — fees, slippage, fill timing, and gaps. That is why this shipped
before drawing tools.

---

## What runs today

| Piece | Status | Location |
|---|---|---|
| Deterministic engine (bar-by-bar loop) | ✅ shipped | `packages/core/src/backtest/engine.ts` |
| Fees + slippage on both sides | ✅ shipped | engine |
| Market / limit / stop entries | ✅ shipped | engine |
| Stop-loss, take-profit, trailing stop | ✅ shipped | engine |
| Stop-vs-target tie-break (configurable) | ✅ shipped | engine |
| Position sizing: fixed qty, fixed notional, % equity, % risk | ✅ shipped | engine |
| Leverage cap | ✅ shipped | engine |
| Equity curve, drawdown, benchmark | ✅ shipped | `metrics.ts` |
| Sharpe, Sortino, Calmar, profit factor, expectancy | ✅ shipped | `metrics.ts` |
| 6 reference strategies | ✅ shipped | `strategies.ts` |
| Real data — Binance public REST (no key) | ✅ shipped | `data/binance.ts` |
| Browser + server runtime, same code | ✅ shipped | core package |
| Off-main-thread execution (Web Worker) | ✅ shipped | `apps/web/workers` |
| Chart markers for every entry/exit | ✅ shipped | `PriceChart.tsx` |
| Trade blotter with exit reasons | ✅ shipped | `TradesTable.tsx` |
| CLI (`npm run demo`) | ✅ shipped | `scripts/backtest-demo.ts` |
| Synthetic offlineruntime for CI/demo | ✅ shipped | `data/synthetic.ts` |
| **Visual strategy builder (no code)** | ⏳ Phase 5 | — |
| **Scriptable strategies (`TradeLang`)** | ⏳ Phase 5 | — |
| **Parameter optimisation / walk-forward** | ⏳ Phase 5–11 | — |
| **Multi-symbol portfolio backtests** | ⏳ Phase 11 | — |
| **Server-side runs (long histories, queues)** | ⏳ Phase 2–3 | — |

---

## The no-lookahead rule (the one that matters)

A backtest is a lie unless signal and fill are separated in time. The engine
enforces this structurally:

```
bar i:   strategy sees bar i (closed)  →  may queue an order
bar i+1: queued order fills at that bar's OPEN
```

Consequences, all covered by tests:

- A signal on the bar that produced it can **never** fill on that bar.
- A limit order only fills if the bar's range actually touched the price.
- A gap through a stop fills at the **open**, not at the stop price.
- When one bar contains both stop and target, the engine cannot know the order,
  so `intrabarPriority` decides — **`stop-first` by default** (pessimistic).
- A trailing stop armed from a bar's own high is only live **from the next bar**,
  because that bar's range necessarily "touches" a level it created.

That last rule was found by a test, not by intuition — it was producing a fill
at a price the bar never traded after the stop existed.

## Cost model

| Assumption | Default | Why |
|---|---|---|
| Commission | 10 bps per side | realistic retail taker fee |
| Slippage | 5 bps per side, always adverse | never assumes you get the mid |
| Leverage | 1× | the honest default |
| Sizing | 95% of equity | leaves room for fees |
| Risk-free rate | 0% | configurable for Sharpe |

Every trade records its fees, so `sum(trade.fees) === stats.totalFees` is a test,
and the equity curve — not the trade list — is the source of the headline return.

## How to run it

```bash
npm run demo                                    # BTCUSDT 4h, 3000 bars, all strategies
npm run demo -- --symbol ETHUSDT --tf 1h --bars 5000
npm run demo -- --offline                       # deterministic synthetic, no network
npm run demo -- --strategy donchian --json      # machine-readable
```

The CLI prints the **buy & hold** benchmark next to every strategy. Most
strategies lose to it after costs, and the tool says so plainly rather than
cherry-picking a parameter set.

In the browser, the chart page runs the same engine in a Web Worker; switching
strategy re-runs all six in milliseconds without blocking the chart.

## Data honesty

Three states, always visible in the UI:

1. **LIVE** — Binance public REST, real-time, no delay.
2. **DELAYED Nm** — reserved for equity providers in Phase 3.
3. **SYNTHETIC** — network unavailable; a loud badge states the results are
   illustrative only.

The synthetic generator is seeded per symbol, so CI, screenshots, and demos are
reproducible without a network connection.

## Known limitations (stated, not hidden)

- **One position at a time.** No pyramiding or hedging yet.
- **Bar-close signals only.** No intrabar/tick-level strategy execution.
- **No partial fills or liquidity model.** A 10,000-unit order fills like a 1-unit order.
- **No shorting costs** (borrow/funding) — crypto perps in particular will look
  better than reality until Phase 10 adds funding rates.
- **No survivorship-bias handling** for equities — delisted symbols aren't in the
  free symbol lists yet.
- **Overfitting is the user's problem, and the tool tries to make it obvious:**
  the benchmark, the warning list, and the drawdown chart exist to stop a lucky
  parameter set from looking like skill.

## Verification

```bash
npm test          # 49 tests; 20+ target the engine specifically
```

The engine tests are written to fail if the pessimistic assumptions are ever
weakened — gap fills, stop ordering, cost accounting, and determinism each have
a dedicated test.
