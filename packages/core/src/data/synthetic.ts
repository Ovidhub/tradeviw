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
 * Deterministic synthetic dataset.
 *
 * Purpose: the app must be demoable, testable, and screenshot-able with **zero
 * network**. CI has no market access, and a new contributor should be able to
 * `npm run dev` and see a working chart. Every bar here is badged
 * `synthetic: true` in the UI so it can never be mistaken for real data.
 */

/** mulberry32 — small, fast, and reproducible across platforms. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable numeric seed from a string, so `BTCUSDT` always yields the same series. */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Box–Muller transform for normally distributed shocks. */
function gaussian(rand: () => number): number {
  const u = Math.max(rand(), Number.EPSILON);
  const v = Math.max(rand(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface SyntheticOptions {
  bars: number;
  startTime: number;
  timeframe: Timeframe;
  startPrice?: number;
  /** Annualized drift as a fraction (0.35 = +35%/yr). */
  drift?: number;
  /** Annualized volatility as a fraction (0.7 = 70%/yr). */
  volatility?: number;
  /** Optional regime shifts, so trend strategies have something to find. */
  regimes?: boolean;
  seed?: string;
}

/**
 * Generate a plausible OHLCV series with GBM prices, intrabar wicks, and volume
 * that clusters on big moves (so volume-based indicators behave sanely).
 */
export function syntheticCandles(opts: SyntheticOptions): Candle[] {
  const {
    bars,
    startTime,
    timeframe,
    startPrice = 30_000,
    drift = 0.3,
    volatility = 0.65,
    regimes = true,
    seed = 'tradeviw',
  } = opts;

  const step = TIMEFRAME_MS[timeframe] / 1000;
  const ppy = 365 * 24 * 3600 / step;
  const rand = mulberry32(seedFromString(seed));

  const out: Candle[] = [];
  let price = startPrice;
  let regimeDrift = drift;

  for (let i = 0; i < bars; i++) {
    if (regimes && i > 0 && i % Math.floor(bars / 6) === 0) {
      // Alternate bull / chop / bear so trend and mean-reversion strategies both
      // get a fair test instead of one lucky regime.
      const phase = Math.floor(i / Math.floor(bars / 6)) % 3;
      regimeDrift = phase === 0 ? drift : phase === 1 ? -drift * 0.6 : drift * 1.4;
    }

    const mu = regimeDrift / ppy;
    const sigma = volatility / Math.sqrt(ppy);
    const shock = gaussian(rand);
    const ret = mu - 0.5 * sigma * sigma + sigma * shock;

    const open = price;
    const close = open * Math.exp(ret);
    const wick = Math.abs(shock) * sigma * open * 1.4;
    const high = Math.max(open, close) + wick * rand();
    const low = Math.max(1e-8, Math.min(open, close) - wick * rand());
    const volume = (1 + Math.abs(shock) * 3) * (500 + rand() * 1500);

    out.push({
      time: startTime + i * step,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(volume * 100) / 100,
    });
    price = close;
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

export const DEMO_SYMBOL: SymbolInfo = {
  id: 'DEMO:BTCUSD',
  ticker: 'BTCUSD',
  name: 'Bitcoin / US Dollar (demo)',
  assetClass: 'crypto',
  venue: 'DEMO',
  quote: 'USD',
  precision: 2,
};

export class SyntheticProvider implements DataProvider {
  readonly id = 'synthetic';
  readonly assetClasses = ['crypto', 'equity', 'forex', 'index', 'commodity'] as const;
  readonly realtime = false;
  readonly delayMs = 0;

  supports(): boolean {
    return true;
  }

  async history(req: HistoryRequest): Promise<CandleSeries> {
    const step = TIMEFRAME_MS[req.timeframe] / 1000;
    const limit = req.limit ?? 1000;
    const start = Math.floor(req.from / step) * step;
    const candles = syntheticCandles({
      bars: limit,
      startTime: start,
      timeframe: req.timeframe,
      seed: req.symbolId,
    });
    return {
      symbol: DEMO_SYMBOL,
      timeframe: req.timeframe,
      candles,
      provenance: {
        source: this.id,
        label: 'Deterministic demo dataset · synthetic',
        synthetic: true,
        delayMs: 0,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
