import {
  BinanceRestProvider,
  fetchPagedHistory,
  syntheticCandles,
  TIMEFRAME_MS,
  type CandleSeries,
  type Timeframe,
} from '@tradeviw/core';

/**
 * Market data loading for the browser.
 *
 * Why the fetch happens here rather than on the server: Binance's public REST
 * API sends `Access-Control-Allow-Origin: *`, so the browser can talk to it
 * directly with no key, no proxy, and no cost to us. That keeps the promise of
 * real-time free data while the server stays free of provider credentials.
 *
 * The honest part: if the fetch fails (offline, blocked region, rate limit) we
 * fall back to a deterministic synthetic series and mark it clearly. The UI must
 * never render a synthetic candle as if it were real.
 */

export interface LoadOptions {
  symbolId: string;
  timeframe: Timeframe;
  bars: number;
  signal?: AbortSignal;
  onProgress?: (loaded: number) => void;
}

export interface LoadResult {
  series: CandleSeries;
  /** Set when we wanted live data and could not get it. */
  fallbackReason?: string;
}

export const SYMBOLS = [
  { id: 'BINANCE:BTCUSDT', ticker: 'BTCUSDT', label: 'BTC / USDT' },
  { id: 'BINANCE:ETHUSDT', ticker: 'ETHUSDT', label: 'ETH / USDT' },
  { id: 'BINANCE:SOLUSDT', ticker: 'SOLUSDT', label: 'SOL / USDT' },
  { id: 'BINANCE:BNBUSDT', ticker: 'BNBUSDT', label: 'BNB / USDT' },
  { id: 'BINANCE:XRPUSDT', ticker: 'XRPUSDT', label: 'XRP / USDT' },
] as const;

const TIMEOUT_MS = 12_000;

export async function loadSeries(opts: LoadOptions): Promise<LoadResult> {
  const { symbolId, timeframe, bars, signal } = opts;
  const ticker = symbolId.split(':')[1] ?? symbolId;

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const provider = new BinanceRestProvider();
    const series = await fetchPagedHistory(provider, symbolId, timeframe, bars, {
      onProgress: opts.onProgress,
    });
    if (signal?.aborted) throw new Error('aborted');
    return { series };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { series: await syntheticSeries(symbolId, ticker, timeframe, bars), fallbackReason: reason };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Deterministic offline series, clearly labelled as synthetic. */
export async function syntheticSeries(
  symbolId: string,
  ticker: string,
  timeframe: Timeframe,
  bars: number,
): Promise<CandleSeries> {
  const step = TIMEFRAME_MS[timeframe] / 1000;
  const startTime = Math.floor(Date.now() / 1000) - bars * step;
  return {
    symbol: {
      id: symbolId,
      ticker,
      name: `${ticker} (demo)`,
      assetClass: 'crypto',
      venue: 'DEMO',
      quote: 'USDT',
      precision: 2,
    },
    timeframe,
    candles: syntheticCandles({ bars, startTime, timeframe, seed: ticker }),
    provenance: {
      source: 'synthetic',
      label: 'Deterministic demo dataset · synthetic',
      synthetic: true,
      delayMs: 0,
      fetchedAt: new Date().toISOString(),
    },
  };
}
