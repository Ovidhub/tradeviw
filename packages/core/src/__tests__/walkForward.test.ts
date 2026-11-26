import { describe, expect, it } from 'vitest';
import { walkForward, walkForwardSummary } from '../backtest/walkForward';
import { smaCross } from '../backtest/strategies';
import type { WalkForwardOptions } from '../backtest/walkForward';
import { syntheticCandles } from '../data/synthetic';
import type { Candle } from '../types';

const wfDefaults: WalkForwardOptions = {
  trainBars: 100,
  testBars: 50,
  stepBars: 50,
  feeBps: 0,
  slippageBps: 0,
  initialCapital: 10_000,
  sizing: { type: 'fixed_notional', notional: 10_000 },
  allowShort: true,
};

describe('walkForward — windowing', () => {
  it('splits data into non-overlapping train/test windows', () => {
    const candles = syntheticCandles({ bars: 300, startTime: 0, timeframe: '1h', seed: 'wf-window' });
    const result = walkForward(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 20], slow: [30, 50] },
      candles,
      '1h',
      wfDefaults,
    );
    // 300 bars, train=100, test=50, step=50 → windows at 0, 50, 100, 150
    expect(result.steps).toHaveLength(4);
    expect(result.steps[0]!.trainRange).toEqual({ start: 0, end: 100 });
    expect(result.steps[0]!.testRange).toEqual({ start: 100, end: 150 });
    expect(result.steps[3]!.trainRange).toEqual({ start: 150, end: 250 });
    expect(result.steps[3]!.testRange).toEqual({ start: 250, end: 300 });
  });

  it('train and test windows never overlap within a step', () => {
    const candles = syntheticCandles({ bars: 300, startTime: 0, timeframe: '1h', seed: 'wf-nonoverlap' });
    const result = walkForward(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10], slow: [20] },
      candles,
      '1h',
      wfDefaults,
    );
    for (const step of result.steps) {
      expect(step.testRange.start).toBe(step.trainRange.end);
    }
  });
});

describe('walkForward — results structure', () => {
  it('each step has best params, in-sample and out-of-sample results', () => {
    const candles = syntheticCandles({ bars: 300, startTime: 0, timeframe: '1h', seed: 'wf-struct' });
    const result = walkForward(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 20], slow: [30, 50] },
      candles,
      '1h',
      wfDefaults,
    );
    for (const step of result.steps) {
      expect(step.bestParams).toHaveProperty('fast');
      expect(step.bestParams).toHaveProperty('slow');
      expect(step.inSample.result.strategy).toContain('SMA crossover');
      expect(step.outOfSample.strategy).toContain('SMA crossover');
      expect(Number.isFinite(step.outOfSample.stats.finalEquity)).toBe(true);
      expect(step.outOfSample.equity).toHaveLength(step.testRange.end - step.testRange.start);
    }
  });

  it('aggregate stats are present and bounded', () => {
    const candles = syntheticCandles({ bars: 300, startTime: 0, timeframe: '1h', seed: 'wf-agg' });
    const result = walkForward(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 20], slow: [30, 50] },
      candles,
      '1h',
      wfDefaults,
    );
    const { aggregate } = result;
    expect(Number.isFinite(aggregate.avgOutOfSampleReturnPct)).toBe(true);
    expect(Number.isFinite(aggregate.avgInSampleReturnPct)).toBe(true);
    expect(aggregate.outOfSampleWinRate).toBeGreaterThanOrEqual(0);
    expect(aggregate.outOfSampleWinRate).toBeLessThanOrEqual(1);
    expect(aggregate.beatBenchmarkRate).toBeGreaterThanOrEqual(0);
    expect(aggregate.beatBenchmarkRate).toBeLessThanOrEqual(1);
    expect(aggregate.totalOutOfSampleTrades).toBeGreaterThanOrEqual(0);
  });
});

describe('walkForward — overfitting detection', () => {
  it('reports the in-sample → out-of-sample gap', () => {
    const candles = syntheticCandles({ bars: 400, startTime: 0, timeframe: '1h', seed: 'wf-gap' });
    const result = walkForward(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 20, 30], slow: [40, 60, 80] },
      candles,
      '1h',
      wfDefaults,
    );
    const summary = walkForwardSummary(result);
    expect(summary).toContain('in-sample → out-of-sample gap');
    expect(summary).toContain('windows:');
    expect(summary).toContain('beating buy & hold');
  });

  it('parameter stability sums to 1 per param key', () => {
    const candles = syntheticCandles({ bars: 300, startTime: 0, timeframe: '1h', seed: 'wf-stab' });
    const result = walkForward(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 20], slow: [30, 50] },
      candles,
      '1h',
      wfDefaults,
    );
    for (const [, dist] of Object.entries(result.aggregate.parameterStability)) {
      let total = 0;
      for (const v of Object.values(dist) as number[]) total += v;
      expect(total).toBeCloseTo(1, 6);
    }
  });
});

describe('walkForward — safety', () => {
  it('throws when data is too short for one window', () => {
    const candles: Candle[] = [];
    expect(() =>
      walkForward(
        (p) => smaCross(Number(p.fast), Number(p.slow)),
        { fast: [10], slow: [20] },
        candles,
        '1h',
        { ...wfDefaults, trainBars: 10, testBars: 10 },
      ),
    ).toThrow(/at least/);
  });

  it('throws when trainBars < 10', () => {
    const candles = syntheticCandles({ bars: 100, startTime: 0, timeframe: '1h', seed: 'wf-short' });
    expect(() =>
      walkForward(
        (p) => smaCross(Number(p.fast), Number(p.slow)),
        { fast: [10], slow: [20] },
        candles,
        '1h',
        { ...wfDefaults, trainBars: 5 },
      ),
    ).toThrow(/trainBars must be >= 10/);
  });

  it('is deterministic across runs', () => {
    const candles = syntheticCandles({ bars: 300, startTime: 0, timeframe: '1h', seed: 'wf-det' });
    const a = walkForward(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 20], slow: [30, 50] },
      candles,
      '1h',
      wfDefaults,
    );
    const b = walkForward(
      (p) => smaCross(Number(p.fast), Number(p.slow)),
      { fast: [10, 20], slow: [30, 50] },
      candles,
      '1h',
      wfDefaults,
    );
    expect(a.steps.map((s) => s.outOfSample.stats.finalEquity)).toEqual(
      b.steps.map((s) => s.outOfSample.stats.finalEquity),
    );
    expect(a.aggregate.avgOutOfSampleReturnPct).toBe(
      b.aggregate.avgOutOfSampleReturnPct,
    );
  });
});
