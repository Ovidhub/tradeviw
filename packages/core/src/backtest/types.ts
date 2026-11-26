import type { Candle, Timeframe } from '../types';
import type { Series } from '../indicators/index';

/**
 * Backtest contracts.
 *
 * Design principles, in priority order:
 *  1. **No lookahead.** A signal produced on bar `i`'s close can only fill on
 *     bar `i+1` or later. The engine enforces this; strategies cannot opt out.
 *  2. **Pessimistic fills.** When a bar's range contains both the stop and the
 *     target, the stop is assumed first. Gap-through fills happen at the open.
 *  3. **Every number is explainable.** Fees, slippage, and exit reason are
 *     recorded per trade so a user can reconcile the equity curve by hand.
 */

export type Side = 1 | -1;

export type OrderType = 'market' | 'limit' | 'stop';

export interface OrderRequest {
  /** Omit to use the configured sizing rule. */
  qty?: number;
  /** Resting order price for `limit` / `stop`. Ignored for `market`. */
  price?: number;
  type?: OrderType;
  /** Protective stop. Also drives `risk_percent` sizing when present. */
  stopLoss?: number;
  takeProfit?: number;
  /** Trailing distance in absolute price units. */
  trailingStop?: number;
}

export type Sizing =
  | { type: 'fixed_qty'; qty: number }
  | { type: 'fixed_notional'; notional: number }
  | { type: 'percent_equity'; percent: number }
  | { type: 'risk_percent'; percent: number };

export interface BacktestConfig {
  initialCapital: number;
  /** Commission per side, in basis points of notional (10 bps = 0.10%). */
  feeBps: number;
  /** Adverse slippage per side, in basis points. */
  slippageBps: number;
  /** Max notional exposure as a multiple of equity. 1 = no leverage. */
  leverage: number;
  sizing: Sizing;
  allowShort: boolean;
  /** Annual risk-free rate for Sharpe/Sortino. */
  riskFreeRate: number;
  /** Which protective level wins when a single bar spans both. */
  intrabarPriority: 'stop-first' | 'target-first';
}

export const DEFAULT_CONFIG: BacktestConfig = {
  initialCapital: 10_000,
  feeBps: 10,
  slippageBps: 5,
  leverage: 1,
  sizing: { type: 'percent_equity', percent: 95 },
  allowShort: false,
  riskFreeRate: 0,
  intrabarPriority: 'stop-first',
};

export interface Position {
  side: Side;
  qty: number;
  entryPrice: number;
  entryTime: number;
  entryIndex: number;
  stopLoss?: number;
  takeProfit?: number;
  trailingStop?: number;
  /**
   * Bar index at which the trailing stop was armed. A trailing level derived
   * from a bar's own extreme is necessarily "touched" by that bar's range, so
   * it only becomes effective from the following bar.
   */
  trailingArmedAtBar: number;
  /** Best/worst excursion while open, for trade quality analysis. */
  mfe: number;
  mae: number;
  trailingPeak: number;
  trailingTrough: number;
  entryFee: number;
}

export interface Trade {
  side: Side;
  qty: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  /** Net of fees and slippage. */
  pnl: number;
  /** pnl as a fraction of equity at entry. */
  pnlPct: number;
  fees: number;
  barsHeld: number;
  exitReason: 'signal' | 'stop' | 'target' | 'trailing' | 'liquidation' | 'end';
  mfe: number;
  mae: number;
}

/** Mutable handle a strategy uses to act. Provided fresh each bar. */
export interface BarContext {
  index: number;
  candle: Candle;
  bars: readonly Candle[];
  position: Readonly<Position> | null;
  equity: number;
  /** Precomputed indicator series, keyed by what `prepare` returned. */
  series: Record<string, Series>;
  /** Convenience: current value of a prepared series, or null. */
  value(key: string): number | null;
  /** Enter long (or reverse a short). Fills next bar open unless type is limit/stop. */
  buy(order?: OrderRequest): void;
  /** Enter short (or reverse a long). */
  sell(order?: OrderRequest): void;
  /** Flatten at next available price. */
  close(reason?: 'signal'): void;
  /** Update protective levels on an open position immediately. */
  setStops(levels: { stopLoss?: number; takeProfit?: number; trailingStop?: number }): void;
}

export interface Strategy {
  name: string;
  description?: string;
  /** Compute indicators once over the whole series (vectorized, no lookahead if you index by i). */
  prepare?(candles: readonly Candle[]): Record<string, Series>;
  /** Called once per closed bar, in order. */
  onBar(ctx: BarContext): void;
}

export interface EquityPoint {
  time: number;
  equity: number;
  /** Buy-and-hold equity for the same starting capital, for comparison. */
  benchmark: number;
  drawdownPct: number;
}

export interface BacktestStats {
  initialCapital: number;
  finalEquity: number;
  totalReturnPct: number;
  benchmarkReturnPct: number;
  /** Compound annual growth rate, as a fraction (0.42 = 42%). */
  cagr: number;
  annualizedVolatility: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  maxDrawdownPct: number;
  maxDrawdownDurationBars: number;
  totalTrades: number;
  longTrades: number;
  shortTrades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  averageBarsHeld: number;
  totalFees: number;
  /** Fraction of bars with an open position. */
  exposurePct: number;
}

export interface BacktestResult {
  strategy: string;
  timeframe: Timeframe;
  config: BacktestConfig;
  equity: EquityPoint[];
  trades: Trade[];
  stats: BacktestStats;
  /** Non-fatal problems the user must see: gaps, zero trades, data quirks. */
  warnings: string[];
  /** Wall-clock time for the simulation, ms. */
  runtimeMs: number;
}
