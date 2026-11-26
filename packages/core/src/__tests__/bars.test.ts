import { describe, expect, it } from 'vitest';
import { bucketStart, dedupeCandles, findGaps, normalizeCandles, resample, validateSeries } from '../bars';
import type { Candle } from '../types';

const c = (time: number, o: number, h: number, l: number, cl: number, v = 1): Candle => ({
  time,
  open: o,
  high: h,
  low: l,
  close: cl,
  volume: v,
});

describe('normalizeCandles', () => {
  it('sorts ascending and drops non-finite rows', () => {
    const input = [c(120, 1, 2, 1, 2), c(60, 1, 2, 1, 2), { ...c(180, 1, 2, 1, 2), close: NaN }];
    const out = normalizeCandles(input);
    expect(out.map((x) => x.time)).toEqual([60, 120]);
  });
});

describe('dedupeCandles', () => {
  it('keeps the last value for a duplicated timestamp', () => {
    const out = dedupeCandles([c(60, 1, 2, 1, 2), c(60, 1, 3, 1, 3)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.close).toBe(3);
  });
});

describe('resample', () => {
  it('aggregates open/high/low/close/volume into 5m from 1m', () => {
    const minutes = [0, 1, 2, 3, 4, 5].map((m) =>
      c(m * 60, 100 + m, 110 + m, 90 + m, 100 + m, 10),
    );
    const out = resample(minutes, '5m');
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ time: 0, open: 100, high: 114, low: 90, close: 104, volume: 50 });
    expect(out[1]).toEqual({ time: 300, open: 105, high: 115, low: 95, close: 105, volume: 10 });
  });

  it('never emits a synthetic bar for an empty bucket', () => {
    const out = resample([c(0, 1, 1, 1, 1), c(600, 2, 2, 2, 2)], '5m');
    expect(out.map((x) => x.time)).toEqual([0, 600]);
  });
});

describe('bucketStart', () => {
  it('aligns to the UTC epoch', () => {
    expect(bucketStart(125, '1m')).toBe(120);
    expect(bucketStart(3700, '1h')).toBe(3600);
  });
});

describe('findGaps', () => {
  it('reports missing bars between two candles', () => {
    const gaps = findGaps([c(0, 1, 1, 1, 1), c(300, 1, 1, 1, 1)], '1m');
    expect(gaps).toEqual([{ from: 0, to: 300, missing: 4 }]);
  });

  it('can ignore weekend holes for equity daily data', () => {
    const fri = 1_700_000_000;
    const mon = fri + 3 * 86400;
    expect(findGaps([c(fri, 1, 1, 1, 1), c(mon, 1, 1, 1, 1)], '1D')).toHaveLength(1);
    expect(
      findGaps([c(fri, 1, 1, 1, 1), c(mon, 1, 1, 1, 1)], '1D', { allowWeekendHoles: true }),
    ).toHaveLength(0);
  });
});

describe('validateSeries', () => {
  it('flags impossible OHLC relationships', () => {
    const { ok, errors } = validateSeries([c(0, 10, 9, 11, 10)]);
    expect(ok).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a clean series', () => {
    expect(validateSeries([c(0, 10, 12, 9, 11), c(60, 11, 13, 10, 12)]).ok).toBe(true);
  });
});
