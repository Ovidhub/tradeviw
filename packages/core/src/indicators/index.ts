import type { Candle } from '../types';

/**
 * Indicator math. One library, two runtimes: the browser renders with it,
 * the server screens/backtests with it, so a chart and a backtest can never
 * disagree about what RSI meant.
 *
 * Conventions:
 *  - Input is `number[]` (aligned to candles) and output is the same length.
 *  - Leading values that cannot be computed are `null`, never 0 or NaN.
 *  - All functions are pure and never mutate their inputs.
 */

export type Series = (number | null)[];

const nn = (n: number): number => (Number.isFinite(n) ? n : Number.NaN);

/**
 * Null-safe indexed read. With `noUncheckedIndexedAccess` on, `s[i]` is
 * `number | null | undefined`; `undefined` (out of range) and `null` (not yet
 * computable) are the same thing to a caller, so collapse them here once.
 */
const at = (s: readonly (number | null)[], i: number): number | null => s[i] ?? null;

/** Simple moving average. */
export function sma(values: readonly number[], period: number): Series {
  if (period <= 0) throw new Error('sma: period must be > 0');
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = nn(sum / period);
  }
  return out;
}

/**
 * Exponential moving average, seeded with the SMA of the first `period` values
 * (the convention used by most charting platforms, so numbers line up).
 */
export function ema(values: readonly number[], period: number): Series {
  if (period <= 0) throw new Error('ema: period must be > 0');
  const out: Series = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let seed = 0;
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (prev === null) {
      seed += v;
      if (i === period - 1) {
        prev = seed / period;
        out[i] = nn(prev);
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = nn(prev);
  }
  return out;
}

/** Wilder's smoothing (RMA) — the basis of RSI/ATR/ADX. */
export function rma(values: readonly number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let seed = 0;
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (prev === null) {
      seed += v;
      if (i === period - 1) {
        prev = seed / period;
        out[i] = nn(prev);
      }
      continue;
    }
    prev = (prev * (period - 1) + v) / period;
    out[i] = nn(prev);
  }
  return out;
}

/** Wilder's RSI over closes. */
export function rsi(closes: readonly number[], period = 14): Series {
  const gains: number[] = new Array(closes.length).fill(0);
  const losses: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    gains[i] = diff > 0 ? diff : 0;
    losses[i] = diff < 0 ? -diff : 0;
  }
  const avgGain = rma(gains.slice(1), period);
  const avgLoss = rma(losses.slice(1), period);
  const out: Series = new Array(closes.length).fill(null);
  for (let i = 0; i < avgGain.length; i++) {
    const g = at(avgGain, i);
    const l = at(avgLoss, i);
    if (g === null || l === null) continue;
    out[i + 1] = l === 0 ? 100 : nn(100 - 100 / (1 + g / l));
  }
  return out;
}

export interface MacdResult {
  macd: Series;
  signal: Series;
  histogram: Series;
}

/** MACD = EMA(fast) − EMA(slow), signal = EMA(macd, signalPeriod). */
export function macd(
  closes: readonly number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdResult {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const macdLine: number[] = [];
  const validIdx: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const f = at(fastEma, i);
    const s = at(slowEma, i);
    if (f === null || s === null) continue;
    validIdx.push(i);
    macdLine.push(f - s);
  }
  const signalOnCompact = ema(macdLine, signalPeriod);

  const macdOut: Series = new Array(closes.length).fill(null);
  const signalOut: Series = new Array(closes.length).fill(null);
  const histOut: Series = new Array(closes.length).fill(null);
  for (let j = 0; j < validIdx.length; j++) {
    const i = validIdx[j]!;
    macdOut[i] = nn(macdLine[j]!);
    const s = at(signalOnCompact, j);
    if (s === null) continue;
    signalOut[i] = nn(s);
    histOut[i] = nn(macdLine[j]! - s);
  }
  return { macd: macdOut, signal: signalOut, histogram: histOut };
}

export interface BollingerResult {
  middle: Series;
  upper: Series;
  lower: Series;
}

/** Bollinger Bands using population standard deviation over the window. */
export function bollingerBands(
  closes: readonly number[],
  period = 20,
  mult = 2,
): BollingerResult {
  const middle = sma(closes, period);
  const upper: Series = new Array(closes.length).fill(null);
  const lower: Series = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const mean = at(middle, i);
    if (mean === null) continue;
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) acc += (closes[j]! - mean) ** 2;
    const sd = Math.sqrt(acc / period);
    upper[i] = nn(mean + mult * sd);
    lower[i] = nn(mean - mult * sd);
  }
  return { middle, upper, lower };
}

/** Average True Range (Wilder). */
export function atr(candles: readonly Candle[], period = 14): Series {
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const prevClose = candles[i - 1]!.close;
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
  }
  return rma(tr.slice(1), period).map((v, i) => (i === 0 ? null : v)) as Series;
}

/** Stochastic %K (raw) and %D (SMA of %K). */
export function stochastic(
  candles: readonly Candle[],
  kPeriod = 14,
  dPeriod = 3,
): { k: Series; d: Series } {
  const k: Series = new Array(candles.length).fill(null);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j]!.high);
      ll = Math.min(ll, candles[j]!.low);
    }
    const close = candles[i]!.close;
    k[i] = hh === ll ? 50 : nn(((close - ll) / (hh - ll)) * 100);
  }
  const dRaw = sma(k.map((v) => v ?? 0), dPeriod);
  const d: Series = dRaw.map((v, i) => (k[i] === null ? null : v));
  return { k, d };
}

/** On-Balance Volume. */
export function obv(candles: readonly Candle[]): Series {
  const out: Series = new Array(candles.length).fill(null);
  let acc = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i > 0) {
      const diff = candles[i]!.close - candles[i - 1]!.close;
      acc += diff > 0 ? candles[i]!.volume : diff < 0 ? -candles[i]!.volume : 0;
    }
    out[i] = acc;
  }
  return out;
}

/**
 * Session-anchored VWAP. Anchors at the UTC day boundary; a backtest that
 * ignores volume weighting will disagree with the chart, so use this one.
 */
export function vwap(candles: readonly Candle[]): Series {
  const out: Series = new Array(candles.length).fill(null);
  let day = -1;
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const d = Math.floor(c.time / 86400);
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    out[i] = vol === 0 ? null : nn(pv / vol);
  }
  return out;
}

/** Donchian channel — used by breakout strategies. */
export function donchian(
  candles: readonly Candle[],
  period = 20,
): { upper: Series; lower: Series; middle: Series } {
  const upper: Series = new Array(candles.length).fill(null);
  const lower: Series = new Array(candles.length).fill(null);
  const middle: Series = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j]!.high);
      ll = Math.min(ll, candles[j]!.low);
    }
    upper[i] = hh;
    lower[i] = ll;
    middle[i] = (hh + ll) / 2;
  }
  return { upper, lower, middle };
}

/** Rolling highest/lowest helper for breakout logic. */
export function highest(values: readonly number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let m = -Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.max(m, values[j]!);
    out[i] = m;
  }
  return out;
}

export function lowest(values: readonly number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let m = Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.min(m, values[j]!);
    out[i] = m;
  }
  return out;
}

/** Standard deviation of returns — annualized volatility, used in reporting. */
export function annualizedVolatility(closes: readonly number[], periodsPerYear = 365): number {
  if (closes.length < 3) return 0;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(closes[i]! / closes[i - 1]! - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
}
