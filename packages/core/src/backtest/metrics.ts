import type { BacktestResult, BacktestStats, EquityPoint, Trade } from './types';
import { TIMEFRAME_MS, type Timeframe } from '../types';

/**
 * Performance metrics. Deliberately conservative: returns are computed from the
 * equity curve (which already includes fees and slippage), not from trade P&L.
 */

/** Infer bars-per-year from the median spacing of the series. */
export function periodsPerYear(equity: readonly EquityPoint[], timeframe: Timeframe): number {
  if (equity.length < 2) return 365;
  const nominal = 365 * 24 * 3600 * 1000;
  const step = TIMEFRAME_MS[timeframe];
  const bars = nominal / step;
  // Equities do not trade 24/7; daily crypto bars are the reference case.
  return Math.max(1, bars);
}

function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export function computeStats(
  equity: readonly EquityPoint[],
  trades: readonly Trade[],
  initialCapital: number,
  timeframe: Timeframe,
  riskFreeRate: number,
  benchmarkReturnPct: number,
  exposurePct: number,
): BacktestStats {
  const finalEquity = equity.at(-1)?.equity ?? initialCapital;
  const totalReturnPct = (finalEquity / initialCapital - 1) * 100;

  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1]!.equity;
    if (prev > 0) rets.push(equity[i]!.equity / prev - 1);
  }

  const ppy = periodsPerYear(equity, timeframe);
  const vol = stdev(rets) * Math.sqrt(ppy);
  const meanRet = mean(rets);
  const rfPerBar = riskFreeRate / ppy;
  const excess = meanRet - rfPerBar;
  const sd = stdev(rets);
  const sharpe = sd === 0 ? 0 : (excess / sd) * Math.sqrt(ppy);

  const downside = rets.filter((r) => r < 0);
  const downsideSd = stdev(downside);
  const sortino = downsideSd === 0 ? 0 : (excess / downsideSd) * Math.sqrt(ppy);

  const maxDrawdownPct = equity.reduce((worst, p) => Math.min(worst, p.drawdownPct), 0);

  // Longest stretch below a previous equity high.
  let peak = -Infinity;
  let cur = 0;
  let maxDur = 0;
  for (const p of equity) {
    if (p.equity >= peak) {
      peak = p.equity;
      cur = 0;
    } else {
      cur++;
      maxDur = Math.max(maxDur, cur);
    }
  }

  const years = equity.length > 1 ? (equity.length - 1) / ppy : 0;
  const cagr =
    years > 0 && finalEquity > 0 && initialCapital > 0
      ? (finalEquity / initialCapital) ** (1 / years) - 1
      : 0;

  const calmar = maxDrawdownPct < 0 ? cagr / Math.abs(maxDrawdownPct / 100) : 0;

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));

  return {
    initialCapital,
    finalEquity,
    totalReturnPct,
    benchmarkReturnPct,
    cagr,
    annualizedVolatility: vol,
    sharpe,
    sortino,
    calmar,
    maxDrawdownPct,
    maxDrawdownDurationBars: maxDur,
    totalTrades: trades.length,
    longTrades: trades.filter((t) => t.side === 1).length,
    shortTrades: trades.filter((t) => t.side === -1).length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss,
    expectancy: trades.length ? trades.reduce((a, t) => a + t.pnl, 0) / trades.length : 0,
    averageWin: wins.length ? grossWin / wins.length : 0,
    averageLoss: losses.length ? -grossLoss / losses.length : 0,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.pnl)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.pnl)) : 0,
    averageBarsHeld: trades.length ? mean(trades.map((t) => t.barsHeld)) : 0,
    totalFees: trades.reduce((a, t) => a + t.fees, 0),
    exposurePct,
  };
}

/** Human-readable one-line summary, used in the CLI demo and the UI. */
export function formatStats(result: Pick<BacktestResult, 'stats' | 'strategy'>): string {
  const s = result.stats;
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  const inf = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : n > 0 ? '∞' : '0.00');
  return [
    `${result.strategy}`,
    `  return        ${pct(s.totalReturnPct)}  (buy & hold ${pct(s.benchmarkReturnPct)})`,
    `  CAGR          ${pct(s.cagr * 100)}`,
    `  max drawdown  ${s.maxDrawdownPct.toFixed(2)}%`,
    `  sharpe        ${inf(s.sharpe)}   sortino ${inf(s.sortino)}   calmar ${inf(s.calmar)}`,
    `  trades        ${s.totalTrades}  (win rate ${s.winRate.toFixed(1)}%, PF ${inf(s.profitFactor)})`,
    `  expectancy    ${s.expectancy.toFixed(2)} per trade   fees ${s.totalFees.toFixed(2)}`,
    `  final equity  ${s.finalEquity.toFixed(2)}`,
  ].join('\n');
}
