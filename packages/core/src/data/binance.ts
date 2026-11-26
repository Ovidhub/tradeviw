import {
  type Candle,
  type CandleSeries,
  type DataProvider,
  type HistoryRequest,
  type SymbolInfo,
  type Timeframe,
  TIMEFRAME_MS,
} from '../types';

/**
 * Binance public REST adapter.
 *
 * Why this one first: it needs no API key, is CORS-enabled (so the browser can
 * call it directly), and is genuinely real-time. That makes it the only place
 * where "free + real-time + legally clean" all hold at once.
 *
 * The adapter takes a `fetch` implementation so the same code runs in the
 * browser and in Node without a shim.
 */

const BASE = 'https://api.binance.com/api/v3';

/** Our timeframe codes → Binance interval strings. */
const INTERVALS: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1M',
};

export const BINANCE_SYMBOLS: SymbolInfo[] = [
  { id: 'BINANCE:BTCUSDT', ticker: 'BTCUSDT', name: 'Bitcoin / TetherUS', assetClass: 'crypto', venue: 'BINANCE', quote: 'USDT', precision: 2 },
  { id: 'BINANCE:ETHUSDT', ticker: 'ETHUSDT', name: 'Ethereum / TetherUS', assetClass: 'crypto', venue: 'BINANCE', quote: 'USDT', precision: 2 },
  { id: 'BINANCE:SOLUSDT', ticker: 'SOLUSDT', name: 'Solana / TetherUS', assetClass: 'crypto', venue: 'BINANCE', quote: 'USDT', precision: 3 },
  { id: 'BINANCE:BNBUSDT', ticker: 'BNBUSDT', name: 'BNB / TetherUS', assetClass: 'crypto', venue: 'BINANCE', quote: 'USDT', precision: 2 },
  { id: 'BINANCE:XRPUSDT', ticker: 'XRPUSDT', name: 'XRP / TetherUS', assetClass: 'crypto', venue: 'BINANCE', quote: 'USDT', precision: 4 },
];

/** Binance kline row: [openTime, open, high, low, close, volume, closeTime, ...]. */
type KlineRow = [number, string, string, string, string, string, number, ...unknown[]];

export function parseKlines(rows: KlineRow[], timeframe: Timeframe): Candle[] {
  const step = TIMEFRAME_MS[timeframe] / 1000;
  return rows.map((r) => ({
    time: Math.floor(r[0] / 1000 / step) * step,
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));
}

export class BinanceRestProvider implements DataProvider {
  readonly id = 'binance-rest';
  readonly assetClasses = ['crypto'] as const;
  readonly realtime = true;
  readonly delayMs = 0;

  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch) {}

  supports(symbol: SymbolInfo): boolean {
    return symbol.assetClass === 'crypto' && symbol.venue === 'BINANCE';
  }

  async history(req: HistoryRequest): Promise<CandleSeries> {
    const symbol = BINANCE_SYMBOLS.find((s) => s.id === req.symbolId);
    if (!symbol) throw new Error(`unknown Binance symbol: ${req.symbolId}`);
    const limit = Math.min(req.limit ?? 1000, 1000);
    const url =
      `${BASE}/klines?symbol=${symbol.ticker}` +
      `&interval=${INTERVALS[req.timeframe]}` +
      `&startTime=${req.from * 1000}` +
      `&endTime=${req.to * 1000}` +
      `&limit=${limit}`;

    const res = await this.fetchImpl(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`Binance ${res.status}: ${res.statusText} (${url})`);
    }
    const rows = (await res.json()) as KlineRow[];
    if (!Array.isArray(rows)) throw new Error('Binance returned an unexpected payload');

    return {
      symbol,
      timeframe: req.timeframe,
      candles: parseKlines(rows, req.timeframe),
      provenance: {
        source: this.id,
        label: 'Binance public REST · real-time',
        synthetic: false,
        delayMs: 0,
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  async search(query: string): Promise<SymbolInfo[]> {
    const q = query.trim().toUpperCase();
    if (!q) return BINANCE_SYMBOLS;
    return BINANCE_SYMBOLS.filter((s) => s.ticker.includes(q) || s.name.toUpperCase().includes(q));
  }
}

/**
 * Fetch as much history as the API will give us by paging backwards.
 * Binance caps each request at 1000 candles, so a 5-year 1h backtest needs ~44
 * calls. Sequential on purpose: it stays inside rate limits and is cancellable.
 */
export async function fetchPagedHistory(
  provider: BinanceRestProvider,
  symbolId: string,
  timeframe: Timeframe,
  bars: number,
  opts: { now?: number; onProgress?: (fetched: number) => void } = {},
): Promise<CandleSeries> {
  const step = (TIMEFRAME_MS[timeframe] / 1000) | 0;
  const end = Math.floor((opts.now ?? Date.now()) / 1000 / step) * step;
  let cursorEnd = end;
  const collected: Candle[] = [];
  let provenance: CandleSeries['provenance'] | null = null;
  let symbol: SymbolInfo | null = null;

  while (collected.length < bars) {
    const want = Math.min(1000, bars - collected.length);
    const from = cursorEnd - want * step;
    const page = await provider.history({ symbolId, timeframe, from, to: cursorEnd, limit: want });
    provenance = page.provenance;
    symbol = page.symbol;
    if (page.candles.length === 0) break;
    collected.unshift(...page.candles);
    opts.onProgress?.(collected.length);
    cursorEnd = page.candles[0]!.time - step;
    if (collected.length >= bars) break;
  }

  const deduped = [...new Map(collected.map((c) => [c.time, c])).values()]
    .sort((a, b) => a.time - b.time)
    .slice(-bars);

  if (!symbol || !provenance) throw new Error('no candles returned');

  return {
    symbol,
    timeframe,
    candles: deduped,
    provenance: { ...provenance, source: 'binance-rest', label: `Binance public REST · ${bars} bars` },
  };
}
