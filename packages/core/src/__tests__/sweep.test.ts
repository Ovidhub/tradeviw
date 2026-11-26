import { describe, expect, it } from 'vitest';
import { sweep, sweepBest, type SweepOptions } from '../backtest/sweep';
import { smaCross, emaCrossAtr } from '../backtest/strategies';
import type { Strategy } from '../backtest/types';
import { syntheticCandles } from '../data/synthetic';
import type { Candle } from '../types';

const c = (time: number, o: number, h: number, l: number, cl: number): Candle => ({
  time,
  open: o,
  high: h,
  low: l,
  close: cl,
  volume: 100,
});

const noCosts: SweepOptions = {
  feeBps: 0,
  slippageBps: 0,
  initialCapital: 10_000,
  sizing: { type: 'fixed_notional', notional: 10_000 },
  allowShort: true,
};

describe('sweep — grid generation', () => {
  it('produces the cartesian product of all param values', () => {
    const candles = syntheticCandles({ bars: 100, startTime: 0, timeframe: '1h', seed: 'sweep-grid' });
    const results = sweep(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 20], slow: [30, 50] },
      candles,
      '1h',
      noCosts,
    );
    expect(results).toHaveLength(4);
    const paramSets = new Set(results.map((r) => JSON.stringify(r.params)));
    expect(paramSets.size).toBe(4);
    expect(paramSets.has(JSON.stringify({ fast: 10, slow: 30 }))).toBe(true);
    expect(paramSets.has(JSON.stringify({ fast: 20, slow: 50 }))).toBe(true);
  });

  it('ranks results with the best first by default (calmar)', () => {
    const candles = syntheticCandles({ bars: 200, startTime: 0, timeframe: '1h', seed: 'sweep-rank' });
    const results = sweep(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 20], slow: [30, 50] },
      candles,
      '1h',
      noCosts,
    );
    const byCalmar = [...results].sort(
      (a, b) => b.result.stats.calmar - a.result.stats.calmar,
    );
    expect(results[0]!.result.stats.calmar).toBeCloseTo(byCalmar[0]!.result.stats.calmar, 6);
  });

  it('respects maxCombinations cap', () => {
    const candles = syntheticCandles({ bars: 100, startTime: 0, timeframe: '1h', seed: 'sweep-cap' });
    const results = sweep(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 20, 30], slow: [40, 50, 60] },
      candles,
      '1h',
      { ...noCosts, maxCombinations: 4 },
    );
    expect(results).toHaveLength(4);
  });

  it('sweepBest returns the top combination or null', () => {
    const candles = syntheticCandles({ bars: 100, startTime: 0, timeframe: '1h', seed: 'sweep-best' });
    const best = sweepBest(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 20], slow: [30, 50] },
      candles,
      '1h',
      noCosts,
    );
    expect(best).not.toBeNull();
    expect(best!.params).toHaveProperty('fast');
    expect(best!.params).toHaveProperty('slow');
    expect(best!.result.strategy).toContain('SMA crossover');
  });
});

describe('sweep — parameter sensitivity', () => {
  it('different params produce different results on the same data', () => {
    const candles = syntheticCandles({ bars: 300, startTime: 0, timeframe: '1h', seed: 'sweep-sens' });
    const results = sweep(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 30], slow: [50, 80] },
      candles,
      '1h',
      noCosts,
    );
    const returns = results.map((r) => r.result.stats.totalReturnPct);
    const unique = new Set(returns.map((v) => v.toFixed(4)));
    expect(unique.size).toBeGreaterThan(1);
  });

  it('works with emaCrossAtr which has 4 params', () => {
    const candles = syntheticCandles({ bars: 300, startTime: 0, timeframe: '1h', seed: 'sweep-ema' });
    const results = sweep(
      (p) =>
        emaCrossAtr(
          Number(p.fast),
          Number(p.slow),
          Number(p.atrPeriod),
          Number(p.atrMult),
        ),
      { fast: [12], slow: [26], atrPeriod: [14], atrMult: [2, 3] },
      candles,
      '1h',
      noCosts,
    );
    expect(results).toHaveLength(2);
    expect(results[0]!.params.atrMult).toBeDefined();
  });
});

describe('sweep — safety', () => {
  it('throws when candles are too short (propagates from engine)', () => {
    const candles: Candle[] = [];
    expect(() =>
      sweep(
        (p) => smaCross(Number(p.fast), Number(p.slow)),
        { fast: [10], slow: [20] },
        candles,
        '1h',
        noCosts,
      ),
    ).toThrow(/at least 10 bars/);
  });

  it('is deterministic: same grid, same ranking', () => {
    const candles = syntheticCandles({ bars: 200, startTime: 0, timeframe: '1h', seed: 'sweep-det' });
    const a = sweep(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 20], slow: [30, 50] },
      candles,
      '1h',
      noCosts,
    );
    const b = sweep(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 20], slow: [30, 50] },
      candles,
      '1h',
      noCosts,
    );
    expect(a.map((r) => r.result.stats.finalEquity)).toEqual(
      b.map((r) => r.result.stats.finalEquity),
    );
  });
});
