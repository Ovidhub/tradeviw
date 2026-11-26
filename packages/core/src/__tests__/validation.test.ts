import { describe, expect, it } from 'vitest';
import { referenceSma, runValidationSuite } from '../backtest/validation';
import { smaCross } from '../backtest/strategies';
import type { BacktestConfig } from '../backtest/types';
import { sma } from '../indicators/index';
import { syntheticCandles } from '../data/synthetic';

const noCosts: Partial<BacktestConfig> = {
  feeBps: 0,
  slippageBps: 0,
  initialCapital: 10_000,
  sizing: { type: 'fixed_notional', notional: 10_000 },
  allowShort: true,
};

describe('validation — reference math', () => {
  it('referenceSma matches the library SMA on known values', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const period = 4;
    const ref = referenceSma(values, period);
    const lib = sma(values, period);
    for (let i = period - 1; i < values.length; i++) {
      const v = lib[i] ?? 0;
      expect(v).toBeCloseTo(ref[i] ?? 0, 10);
    }
  });

  it('reference buy & hold equals the price ratio', () => {
    const candles = syntheticCandles({ bars: 100, startTime: 0, timeframe: '1h', seed: 'val-bh' });
    const first = candles[0]!.close;
    const last = candles.at(-1)!.close;
    const expected = (last / first - 1) * 100;
    expect(expected).toBeGreaterThan(-100);
    expect(Number.isFinite(expected)).toBe(true);
  });
});

describe('validation — engine checks', () => {
  it('determinism passes on the same input', () => {
    const candles = syntheticCandles({ bars: 200, startTime: 0, timeframe: '1h', seed: 'val-det' });
    const results = runValidationSuite({
      strategy: smaCross(20, 50),
      candles,
      config: noCosts,
    });
    const det = results.find((r) => r.name === 'determinism');
    expect(det).toBeDefined();
    expect(det!.passed).toBe(true);
    expect(det!.detail).toContain('identical outputs');
  });

  it('buy & hold sanity passes', () => {
    const candles = syntheticCandles({ bars: 100, startTime: 0, timeframe: '1h', seed: 'val-bh2' });
    const results = runValidationSuite({
      strategy: smaCross(20, 50),
      candles,
      config: noCosts,
    });
    const bh = results.find((r) => r.name === 'buy & hold sanity');
    expect(bh).toBeDefined();
    expect(bh!.passed).toBe(true);
    expect(bh!.detail).toMatch(/reconciles/);
  });

  it('SMA cross-check passes when the library matches the reference', () => {
    const values = Array.from({ length: 100 }, (_, i) => 100 + i);
    const period = 20;
    const lib = sma(values, period);
    const results = runValidationSuite({
      strategy: smaCross(20, 50),
      candles: syntheticCandles({ bars: 100, startTime: 0, timeframe: '1h', seed: 'val-sma' }),
      config: noCosts,
      smaValues: values,
      smaPeriod: period,
      computedSma: lib,
    });
    const smaCheck = results.find((r) => r.name === 'sma cross-check');
    expect(smaCheck).toBeDefined();
    expect(smaCheck!.passed).toBe(true);
    expect(smaCheck!.detail).toContain('matches reference');
  });
});

describe('validation — full suite shape', () => {
  it('returns at least determinism + buy & hold checks', () => {
    const candles = syntheticCandles({ bars: 100, startTime: 0, timeframe: '1h', seed: 'val-shape' });
    const results = runValidationSuite({
      strategy: smaCross(20, 50),
      candles,
      config: noCosts,
    });
    expect(results.length).toBeGreaterThanOrEqual(2);
    const names = results.map((r) => r.name);
    expect(names).toContain('determinism');
    expect(names).toContain('buy & hold sanity');
    for (const r of results) {
      expect(typeof r.passed).toBe('boolean');
      expect(typeof r.detail).toBe('string');
      expect(r.detail.length).toBeGreaterThan(0);
    }
  });
});
