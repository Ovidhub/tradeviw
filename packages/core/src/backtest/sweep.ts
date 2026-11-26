import type { Candle, Timeframe } from '../types';
import { runBacktest } from './engine';
import type { BacktestConfig, BacktestResult, Strategy } from './types';

/** A single combination's outcome. */
export interface SweepResult {
  /** The parameter values that produced this result. */
  params: Record<string, unknown>;
  /** The full backtest result for those params. */
  result: BacktestResult;
}

/** Ranking metrics available to the sweep. */
export type RankMetric =
  | 'totalReturnPct'
  | 'calmar'
  | 'sharpe'
  | 'sortino'
  | 'profitFactor';

/** Options shared by sweep and walk-forward. */
export interface SweepOptions {
  initialCapital?: number;
  feeBps?: number;
  slippageBps?: number;
  leverage?: number;
  sizing?: BacktestConfig['sizing'];
  allowShort?: boolean;
  riskFreeRate?: number;
  intrabarPriority?: BacktestConfig['intrabarPriority'];
  /** Metric to rank combinations by. Default 'calmar'. */
  rankBy?: RankMetric;
  /** Safety cap on the number of combinations (grid size = product of lengths). */
  maxCombinations?: number;
}

const DEFAULT_CONFIG: BacktestConfig = {
  initialCapital: 10_000,
  feeBps: 10,
  slippageBps: 5,
  leverage: 1,
  sizing: { type: 'percent_equity', percent: 95 },
  allowShort: false,
  riskFreeRate: 0,
  intrabarPriority: 'stop-first',
};

function metricValue(stat: BacktestResult['stats'], rankBy: RankMetric): number {
  const v = stat[rankBy];
  return typeof v === 'number' && Number.isFinite(v) ? v : -Infinity;
}

/**
 * Cartesian product sweep over a strategy's parameter grid.
 *
 * Every combination is run through `runBacktest` with identical config, and
 * results are returned ranked by `rankBy` (default: Calmar ratio — return per
 * unit of max drawdown, which penalises curve-fitted equity curves).
 *
 * Safety: `maxCombinations` (default 200) prevents an accidental explosion
 * from a wide grid. For honest walk-forward use, keep grids small.
 */
export function sweep(
  makeStrategy: (params: Record<string, unknown>) => Strategy,
  paramGrid: Record<string, unknown[]>,
  candles: readonly Candle[],
  timeframe: Timeframe,
  options: SweepOptions = {},
): SweepResult[] {
  const keys = Object.keys(paramGrid);
  const values = keys.map((k) => paramGrid[k]!);

  // Cartesian product, built iteratively to avoid recursion depth issues.
  const combinations: Record<string, unknown>[] = [{}];
  for (let ki = 0; ki < keys.length; ki++) {
    const key = keys[ki]!;
    const vals = values[ki]!;
    const next: Record<string, unknown>[] = [];
    for (const combo of combinations) {
      for (const v of vals) {
        next.push({ ...combo, [key]: v });
      }
    }
    combinations.length = 0;
    combinations.push(...next);
  }

  const max = options.maxCombinations ?? 200;
  if (combinations.length > max) {
    combinations.length = max;
  }

  const config: BacktestConfig = { ...DEFAULT_CONFIG, ...options };
  const rankBy = options.rankBy ?? 'calmar';

  const results: SweepResult[] = [];
  for (const params of combinations) {
    const strategy = makeStrategy(params);
    const result = runBacktest(strategy, candles, timeframe, config);
    results.push({ params, result });
  }

  results.sort((a, b) => metricValue(b.result.stats, rankBy) - metricValue(a.result.stats, rankBy));
  return results;
}

/** Convenience: run a sweep and return only the best combination. */
export function sweepBest(
  makeStrategy: (params: Record<string, unknown>) => Strategy,
  paramGrid: Record<string, unknown[]>,
  candles: readonly Candle[],
  timeframe: Timeframe,
  options: SweepOptions = {},
): SweepResult | null {
  const results = sweep(makeStrategy, paramGrid, candles, timeframe, options);
  return results.length > 0 ? results[0]! : null;
}
