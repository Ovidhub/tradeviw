import type { Candle, Timeframe } from '../types';
import { sweep, type SweepOptions, type SweepResult } from './sweep';
import { runBacktest } from './engine';
import type { BacktestConfig, BacktestResult, Strategy } from './types';

/** One step of the walk-forward: optimise on train, validate on test. */
export interface WalkForwardStep {
  /** 0-based step index. */
  window: number;
  /** Bar index range [start, end) used for optimisation. */
  trainRange: { start: number; end: number };
  /** Bar index range [start, end) used for out-of-sample validation. */
  testRange: { start: number; end: number };
  /** Parameters that won the in-sample sweep. */
  bestParams: Record<string, unknown>;
  /** Full sweep result for the winner on the train window. */
  inSample: SweepResult;
  /** The winner's params re-run on the unseen test window. */
  outOfSample: BacktestResult;
}

/** Aggregated walk-forward statistics. */
export interface WalkForwardAggregate {
  /** Average out-of-sample return across all steps. */
  avgOutOfSampleReturnPct: number;
  /** Average in-sample return across all steps (for the overfitting gap). */
  avgInSampleReturnPct: number;
  /** Fraction of steps where out-of-sample return was positive. */
  outOfSampleWinRate: number;
  /** Fraction of steps where out-of-sample beat buy & hold on the test window. */
  beatBenchmarkRate: number;
  /** How often each param value was selected (1 = always picked). */
  parameterStability: Record<string, Record<string, number>>;
  /** Total out-of-sample trades across all steps. */
  totalOutOfSampleTrades: number;
}

/** Options for walk-forward analysis. */
export interface WalkForwardOptions extends SweepOptions {
  /** Bars used for optimisation in each step. */
  trainBars: number;
  /** Bars used for out-of-sample testing in each step. */
  testBars: number;
  /** Bars to roll forward each step. Defaults to `testBars` (non-overlapping). */
  stepBars?: number;
}

/**
 * Walk-forward analysis.
 *
 * Splits the data into rolling windows. On each step:
 *   1. Sweep the parameter grid over the in-sample (train) window.
 *   2. Pick the best params by `rankBy`.
 *   3. Re-run those exact params on the out-of-sample (test) window.
 *
 * This is the honest answer to "does this strategy actually work, or did you
 * just overfit it?" A strategy that looks great in-sample but collapses
 * out-of-sample is curve-fitted. Report the aggregate, not the best in-sample
 * number.
 */
export function walkForward(
  makeStrategy: (params: Record<string, unknown>) => Strategy,
  paramGrid: Record<string, unknown[]>,
  candles: readonly Candle[],
  timeframe: Timeframe,
  options: WalkForwardOptions,
): {
  steps: WalkForwardStep[];
  aggregate: WalkForwardAggregate;
} {
  const { trainBars, testBars, stepBars = testBars } = options;
  if (trainBars < 10) throw new Error('walkForward: trainBars must be >= 10');
  if (testBars < 10) throw new Error('walkForward: testBars must be >= 10');
  if (candles.length < trainBars + testBars) {
    throw new Error(
      `walkForward: need at least ${trainBars + testBars} bars, received ${candles.length}`,
    );
  }

  const steps: WalkForwardStep[] = [];
  let start = 0;
  const n = candles.length;

  while (start + trainBars + testBars <= n) {
    const train = candles.slice(start, start + trainBars);
    const test = candles.slice(start + trainBars, start + trainBars + testBars);

    // Optimise on the train window.
    const sweepResults = sweep(
      makeStrategy,
      paramGrid,
      train,
      timeframe,
      options,
    );
    if (sweepResults.length === 0) {
      // No valid combos; advance and continue.
      start += stepBars;
      continue;
    }
    const best = sweepResults[0]!;

    // Re-run the winner on the unseen test window.
    const strategy = makeStrategy(best.params);
    const oos = runBacktest(strategy, test, timeframe, {
      ...options,
      // Inherit config from sweep options.
    } as SweepOptions);

    steps.push({
      window: steps.length,
      trainRange: { start, end: start + trainBars },
      testRange: { start: start + trainBars, end: start + trainBars + testBars },
      bestParams: best.params,
      inSample: best,
      outOfSample: oos,
    });

    start += stepBars;
  }

  if (steps.length === 0) {
    throw new Error(
      'walkForward: no complete windows fit the data — reduce trainBars/testBars',
    );
  }

  const oosReturns = steps.map((s) => s.outOfSample.stats.totalReturnPct);
  const isReturns = steps.map((s) => s.inSample.result.stats.totalReturnPct);
  const oosWins = oosReturns.filter((r) => r > 0).length;
  const beatBench = steps.filter(
    (s) => s.outOfSample.stats.totalReturnPct > s.outOfSample.stats.benchmarkReturnPct,
  ).length;

  // Parameter stability: for each param key, count how often each value won.
  // Values are stringified so they can be object keys.
  const paramKeys = Object.keys(paramGrid);
  const parameterStability: Record<string, Record<string, number>> = {};
  for (const key of paramKeys) {
    const counts: Record<string, number> = {};
    const total = steps.length;
    for (const step of steps) {
      const v = String(step.bestParams[key]);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    // Normalise to fractions so 1 = always picked.
    parameterStability[key] = Object.fromEntries(
      Object.entries(counts).map(([k, c]) => [k, c / total]),
    );
  }

  const aggregate: WalkForwardAggregate = {
    avgOutOfSampleReturnPct:
      oosReturns.reduce((a, b) => a + b, 0) / oosReturns.length,
    avgInSampleReturnPct:
      isReturns.reduce((a, b) => a + b, 0) / isReturns.length,
    outOfSampleWinRate: oosWins / steps.length,
    beatBenchmarkRate: beatBench / steps.length,
    parameterStability,
    totalOutOfSampleTrades: steps.reduce(
      (a, s) => a + s.outOfSample.stats.totalTrades,
      0,
    ),
  };

  return { steps, aggregate };
}

/** Helper: run walk-forward and return a one-line summary for the CLI. */
export function walkForwardSummary(
  result: ReturnType<typeof walkForward>,
): string {
  const { aggregate, steps } = result;
  const gap = (aggregate.avgInSampleReturnPct - aggregate.avgOutOfSampleReturnPct).toFixed(2);
  const oos = aggregate.avgOutOfSampleReturnPct.toFixed(2);
  const bench = aggregate.beatBenchmarkRate;
  return [
    `windows: ${steps.length}`,
    `avg in-sample return : ${aggregate.avgInSampleReturnPct.toFixed(2)}%`,
    `avg out-of-sample return: ${oos}%`,
    `in-sample → out-of-sample gap: ${gap}%`,
    `steps beating buy & hold out-of-sample: ${(bench * 100).toFixed(1)}%`,
  ].join('\n');
}
