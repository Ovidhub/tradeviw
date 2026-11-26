import { describe, expect, it } from 'vitest';
import {
  bollingerBands,
  donchian,
  ema,
  macd,
  obv,
  rma,
  rsi,
  sma,
  stochastic,
  vwap,
} from '../indicators/index';
import type { Candle } from '../types';

/**
 * Indicators are checked against values computed by hand or by the standard
 * definition, not against a snapshot of our own output — a golden file generated
 * from our own bug would happily agree with itself forever.
 */

const bar = (time: number, o: number, h: number, l: number, c: number, v = 100): Candle => ({
  time,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: v,
});

describe('sma', () => {
  it('emits null until the window is full, then exact averages', () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out).toEqual([null, null, 2, 3, 4]);
  });

  it('handles a period longer than the input without crashing', () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });
});

describe('ema', () => {
  it('seeds with the SMA then applies 2/(n+1)', () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(2, 10); // seed = (1+2+3)/3
    expect(out[3]).toBeCloseTo(4 * 0.5 + 2 * 0.5, 10); // 3
    expect(out[4]).toBeCloseTo(5 * 0.5 + 3 * 0.5, 10); // 4
  });
});

describe('rma (Wilder)', () => {
  it('smooths with (prev*(n-1)+x)/n', () => {
    const out = rma([2, 4, 6, 8], 2);
    expect(out[1]).toBeCloseTo(3, 10); // seed (2+4)/2
    expect(out[2]).toBeCloseTo((3 * 1 + 6) / 2, 10); // 4.5
    expect(out[3]).toBeCloseTo((4.5 * 1 + 8) / 2, 10); // 6.25
  });
});

describe('rsi', () => {
  it('is 100 for a monotonically rising series', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const out = rsi(closes, 14);
    expect(out.at(-1)).toBeCloseTo(100, 6);
  });

  it('is 0 for a monotonically falling series', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 - i);
    const out = rsi(closes, 14);
    expect(out.at(-1)).toBeCloseTo(0, 6);
  });

  it('sits near 50 for an alternating series', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    const out = rsi(closes, 14);
    const last = out.at(-1)!;
    expect(last).toBeGreaterThan(40);
    expect(last).toBeLessThan(60);
  });

  it('never returns a value outside 0..100', () => {
    const closes = [10, 11, 10.5, 12, 9, 13, 8, 14, 7, 15, 6, 16, 5, 17, 4, 18, 3, 19, 2, 20];
    for (const v of rsi(closes, 14)) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('macd', () => {
  it('histogram equals macd minus signal wherever both exist', () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const { macd: m, signal, histogram } = macd(closes);
    for (let i = 0; i < closes.length; i++) {
      if (m[i] !== null && signal[i] !== null) {
        expect(histogram[i]!).toBeCloseTo(m[i]! - signal[i]!, 8);
      } else {
        expect(histogram[i]).toBeNull();
      }
    }
  });
});

describe('bollingerBands', () => {
  it('wraps a constant series with zero width', () => {
    const closes = new Array(30).fill(50);
    const { upper, lower } = bollingerBands(closes, 20, 2);
    expect(upper[25]!).toBeCloseTo(50, 10);
    expect(lower[25]!).toBeCloseTo(50, 10);
  });

  it('brackets the middle band', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 5);
    const { middle, upper, lower } = bollingerBands(closes, 20, 2);
    const i = 30;
    expect(upper[i]!).toBeGreaterThan(middle[i]!);
    expect(lower[i]!).toBeLessThan(middle[i]!);
  });
});

describe('stochastic', () => {
  it('is 100 when price closes at the top of the range', () => {
    const candles = Array.from({ length: 20 }, (_, i) => bar(i * 60, 100, 101, 99, 100 + i * 0.1));
    const { k } = stochastic(candles, 14, 3);
    expect(k.at(-1)!).toBeGreaterThan(90);
  });
});

describe('obv', () => {
  it('accumulates volume on up closes and subtracts on down closes', () => {
    const candles = [
      bar(0, 10, 11, 9, 10, 100),
      bar(60, 10, 12, 10, 11, 200),
      bar(120, 11, 11, 9, 9, 300),
    ];
    expect(obv(candles)).toEqual([0, 200, -100]);
  });
});

describe('vwap', () => {
  it('resets at the UTC day boundary', () => {
    const day = 86400;
    const candles = [
      bar(day * 1, 100, 100, 100, 100, 10),
      bar(day * 1 + 60, 110, 110, 110, 110, 10),
      bar(day * 2, 200, 200, 200, 200, 10),
    ];
    const out = vwap(candles);
    expect(out[1]!).toBeCloseTo(105, 8);
    expect(out[2]!).toBeCloseTo(200, 8); // new session
  });
});

describe('donchian', () => {
  it('reports the period high and low of the window', () => {
    const candles = [
      bar(0, 5, 10, 4, 6),
      bar(60, 6, 12, 5, 7),
      bar(120, 7, 9, 3, 8),
    ];
    const { upper, lower } = donchian(candles, 3);
    expect(upper[2]).toBe(12);
    expect(lower[2]).toBe(3);
  });
});
