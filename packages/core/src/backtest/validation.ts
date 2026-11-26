import type { Candle } from '../types';
import { runBacktest } from './engine';
import type { BacktestConfig, Strategy } from './types';

/** A single validation check. */
export interface ValidationResult {
  /** Short name of the check. */
  name: string;
  /** Whether the check passed. */
  passed: boolean;
  /** Human-readable detail, including measured values on failure. */
  detail: string;
}

/** ------------------------------------------------------------------ */
/* Independent reference implementations                              */
/* These are deliberately naive — O(n·p) where the library is O(n) —  */
/* because their only job is to cross-check the optimised versions.   */
/* ------------------------------------------------------------------ */

/** Reference SMA: simple average of the last `period` closes. */
export function referenceSma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(0);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out[i] = 0; // not computable yet
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j]!;
      out[i] = sum / period;
    }
  }
  return out;
}

/** Reference buy & hold: simple price ratio. */
export function referenceBuyAndHoldReturn(
  candles: readonly Candle[],
): number {
  const first = candles[0]!.close;
  const last = candles.at(-1)!.close;
  return first > 0 ? (last / first - 1) * 100 : 0;
}

/** ------------------------------------------------------------------ */
/* Validation checks                                                  */
/* ------------------------------------------------------------------ */

export function validateSma(
  computed: (number | null)[],
  values: number[],
  period: number,
  tolerance = 1e-9,
): ValidationResult {
  const reference = referenceSma(values, period);
  let maxDiff = 0;
  let mismatchAt = -1;
  for (let i = period - 1; i < values.length; i++) {
    const c = computed[i] ?? 0;
    const r = reference[i] ?? 0;
    const diff = Math.abs(c - r);
    if (diff > maxDiff) {
      maxDiff = diff;
      mismatchAt = i;
    }
  }
  const passed = maxDiff <= tolerance;
  return {
    name: 'sma cross-check',
    passed,
    detail: passed
      ? `SMA(${period}) matches reference within ${tolerance}`
      : `SMA(${period}) diverged by ${maxDiff.toExponential(2)} at bar ${mismatchAt}`,
  };
}

export function validateBuyAndHold(
  candles: readonly Candle[],
  config: Partial<BacktestConfig> = {},
): ValidationResult {
  const result = runBacktest(
    {
      name: 'buy & hold',
      onBar(ctx) {
        if (ctx.index === 1 && !ctx.position) ctx.buy();
      },
    },
    candles,
    '1h', // timeframe only affects annualisation, not total return
    config,
  );

  // Internal consistency: the reported return must reconcile with the trade's
  // own entry/exit prices. With no costs, pnl / capital = (exit/entry - 1).
  // This catches any drift between the equity curve and the trade blotter.
  const trade = result.trades[0]!;
  const expected = (trade.exitPrice / trade.entryPrice - 1) * 100;
  const actual = result.stats.totalReturnPct;
  const diff = Math.abs(actual - expected);
  const tolerance = 0.001; // 0.001% — floating point noise only
  const passed = diff <= tolerance;

  return {
    name: 'buy & hold sanity',
    passed,
    detail: passed
      ? `engine return ${actual.toFixed(4)}% reconciles with trade (${trade.entryPrice} → ${trade.exitPrice})`
      : `engine return ${actual.toFixed(4)}% ≠ trade-implied ${expected.toFixed(4)}% (diff ${diff.toFixed(4)}pp)`,
  };
}

export function validateDeterminism(
  strategy: Strategy,
  candles: readonly Candle[],
  config: Partial<BacktestConfig> = {},
): ValidationResult {
  const a = runBacktest(strategy, candles, '1h', config);
  const b = runBacktest(strategy, candles, '1h', config);
  const same =
    a.stats.finalEquity === b.stats.finalEquity &&
    a.trades.length === b.trades.length &&
    a.trades.every(
      (t, i) =>
        t.entryPrice === b.trades[i]!.entryPrice &&
        t.exitPrice === b.trades[i]!.exitPrice &&
        t.pnl === b.trades[i]!.pnl &&
        t.exitReason === b.trades[i]!.exitReason,
    );
  return {
    name: 'determinism',
    passed: same,
    detail: same
      ? 'identical outputs on repeated runs'
      : 'outputs differ between runs — engine is not deterministic',
  };
}

/** ------------------------------------------------------------------ */
/* Full suite                                                         */
/* ------------------------------------------------------------------ */

export interface ValidationSuiteOptions {
  strategy: Strategy;
  candles: readonly Candle[];
  smaValues?: number[]; // close prices, for SMA cross-check
  smaPeriod?: number;
  computedSma?: (number | null)[]; // engine-computed SMA to cross-check
  config?: Partial<BacktestConfig>;
}

/**
 * Run the trust suite: every check that can be verified against an
 * independent reference. Returns one result per check.
 */
export function runValidationSuite(opts: ValidationSuiteOptions): ValidationResult[] {
  const { strategy, candles, config = {} } = opts;
  const results: ValidationResult[] = [
    validateDeterminism(strategy, candles, config),
    validateBuyAndHold(candles, config),
  ];

  if (opts.smaValues !== undefined && opts.computedSma !== undefined) {
    results.push(
      validateSma(
        opts.computedSma,
        opts.smaValues,
        opts.smaPeriod ?? 20,
      ),
    );
  }

  return results;
}
