import { type Candle, type Timeframe, TIMEFRAME_MS } from './types';

/**
 * Bar utilities: validation, resampling, and gap detection.
 * Correct numbers matter more than fast numbers — every function here is
 * tested against hand-computed fixtures.
 */

/** Sort ascending by time and drop non-finite rows. Never mutates the input. */
export function normalizeCandles(candles: readonly Candle[]): Candle[] {
  return candles
    .filter(
      (c) =>
        Number.isFinite(c.time) &&
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close) &&
        Number.isFinite(c.volume) &&
        c.high >= c.low,
    )
    .slice()
    .sort((a, b) => a.time - b.time);
}

/** Remove duplicate timestamps, keeping the last occurrence (freshest). */
export function dedupeCandles(candles: readonly Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const c of candles) byTime.set(c.time, c);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** Bucket key for a timestamp under a given timeframe, aligned to the UTC epoch. */
export function bucketStart(timeSec: number, timeframe: Timeframe): number {
  const step = TIMEFRAME_MS[timeframe] / 1000;
  return Math.floor(timeSec / step) * step;
}

/**
 * Aggregate fine-grained candles into a coarser timeframe.
 *
 * Aggregation is *open of first, close of last, max high, min low, sum volume*.
 * Empty buckets are skipped (no synthetic flat bars) — gaps stay visible, which
 * is exactly what a backtester needs to reason about liquidity honestly.
 */
export function resample(candles: readonly Candle[], timeframe: Timeframe): Candle[] {
  const step = TIMEFRAME_MS[timeframe] / 1000;
  const out: Candle[] = [];

  for (const c of candles) {
    const key = Math.floor(c.time / step) * step;
    const last = out[out.length - 1];
    if (last && last.time === key) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else if (last && key < last.time) {
      // Input out of order — callers should normalize first, but never corrupt output.
      continue;
    } else {
      out.push({ ...c, time: key });
    }
  }
  return out;
}

export interface Gap {
  /** UTC seconds of the last bar before the gap. */
  from: number;
  /** UTC seconds of the first bar after the gap. */
  to: number;
  /** How many bars are missing at this timeframe. */
  missing: number;
}

/**
 * Find holes in a series. Crypto trades 24/7 so any hole is a provider defect;
 * equities legitimately have weekend/overnight holes, so callers should pass
 * `allowWeekendHoles` for daily equity data.
 */
export function findGaps(
  candles: readonly Candle[],
  timeframe: Timeframe,
  opts: { allowWeekendHoles?: boolean } = {},
): Gap[] {
  const step = TIMEFRAME_MS[timeframe] / 1000;
  const gaps: Gap[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const cur = candles[i]!;
    const delta = cur.time - prev.time;
    if (delta <= step) continue;
    const missing = Math.round(delta / step) - 1;
    if (missing <= 0) continue;
    if (opts.allowWeekendHoles && delta >= 2 * 24 * 3600 && delta <= 4 * 24 * 3600) continue;
    gaps.push({ from: prev.time, to: cur.time, missing });
  }
  return gaps;
}

/** Basic sanity check used by ingest jobs before writing to storage. */
export function validateSeries(candles: readonly Candle[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  let prevTime = -Infinity;
  for (const [i, c] of candles.entries()) {
    if (c.time <= prevTime) errors.push(`bar ${i}: time not strictly ascending (${c.time})`);
    prevTime = c.time;
    if (c.high < Math.max(c.open, c.close)) errors.push(`bar ${i}: high below open/close`);
    if (c.low > Math.min(c.open, c.close)) errors.push(`bar ${i}: low above open/close`);
    if (c.volume < 0) errors.push(`bar ${i}: negative volume`);
    if (errors.length > 25) {
      errors.push('… truncated');
      break;
    }
  }
  return { ok: errors.length === 0, errors };
}
