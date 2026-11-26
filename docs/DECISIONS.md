# DECISIONS — Phase 0

Fill this in before writing product code. Every entry is a decision with a reason and a date, so future-you (or a contributor) knows *why*, not just *what*. Revise by appending, never by silently editing.

## 1. Product

| Question | Decision | Rationale | Date |
|---|---|---|---|
| Product name / domain | _TBD_ | | |
| Launch asset classes | crypto (real-time) + US equities (delayed, badged) | only class where free+real-time is legally possible | |
| One-line positioning | "The free, open alternative to TradingView — nothing gated" | | |
| Code licence | MIT / Apache-2.0 | strongest possible "free forever" guarantee | |
| Trademark check done | _TBD_ | avoid TradingView confusion | |

## 2. Charting

| Question | Decision | Rationale | Date |
|---|---|---|---|
| MVP renderer | Lightweight Charts (Apache-2.0) behind `ChartAdapter` | free for commercial use, tiny, fast | |
| Own renderer trigger | multi-pane > 2, volume profile, 60+ drawings | when adapter friction exceeds rewrite cost | |
| Attribution watermark | retained per licence | legal requirement | |

> Advanced Charts / Trading Platform are **proprietary and not licensed to individuals** — never a fallback option.

## 3. Data providers

Record limits **you actually observed** during signup, not marketing copy.

| Provider | Asset classes | Observed limit | Delay | Key required | Used for |
|---|---|---|---|---|---|
| Binance public WS | crypto | | real-time | no | primary crypto |
| Alpaca | US equities (IEX) | | | yes | equities quotes/bars |
| Finnhub | equities, news, calendar | | | yes | news, symbol meta |
| Twelve Data | equities/FX/indices | | | yes | FX, extra coverage |
| FMP | fundamentals | | | yes | fundamentals |
| FRED | macro | | daily | yes (free) | macro series |
| SEC EDGAR | filings/fundamentals | | | no | authoritative fundamentals |

**Hard rule:** no scraping Yahoo/TradingView/Investing.com. Ever.

## 4. Architecture

| Question | Decision | Rationale | Date |
|---|---|---|---|
| Monorepo tool | pnpm + Turborepo | | |
| API framework | Fastify + Zod | | |
| DB | Postgres 16 + TimescaleDB | | |
| Realtime fan-out | Redis Streams + raw `ws` | | |
| Indicator runtime | shared TS lib; WASM sandbox for user scripts | | |
| Auth | Better-Auth / Auth.js | | |
| Hosting: web | Vercel (Pro if commercial) | | |
| Hosting: api/ws | Fly.io or Hetzner | | |

## 5. Non-negotiables

1. No `isPro` / `plan` column in the schema. Free means no code path exists to gate it.
2. Every price shown in the UI carries a data-age badge.
3. Provider adapters are swappable; nothing downstream knows the source.
4. User scripts run only inside the WASM sandbox with no network/fs and an instruction budget.
5. "Not financial advice" + data-delay disclosure before the first public user.

## 6. Cut lines (decided in advance, to avoid scope panic)

- If M1 is late: drop drawing tools, keep data correctness.
- If M2 is late: drop the backtester, keep the script runtime + editor.
- Never cut: data-age badge, indicator golden tests, sandbox hardening.
