import type { BacktestStats } from '@tradeviw/core';
import { money, num, pct, pnlClass, ratio } from '@/lib/format';

/** Metrics grouped by the question they answer, not by how easy they were to compute. */
export function StatsPanel({ stats, warnings }: { stats: BacktestStats; warnings: string[] }) {
  const beatsBenchmark = stats.totalReturnPct > stats.benchmarkReturnPct;

  const groups: { title: string; rows: [string, string, string?][] }[] = [
    {
      title: 'Return',
      rows: [
        ['Net return', pct(stats.totalReturnPct), pnlClass(stats.totalReturnPct)],
        ['Buy & hold', pct(stats.benchmarkReturnPct), pnlClass(stats.benchmarkReturnPct)],
        ['CAGR', pct(stats.cagr * 100), pnlClass(stats.cagr)],
        ['Final equity', money(stats.finalEquity)],
      ],
    },
    {
      title: 'Risk',
      rows: [
        ['Max drawdown', `${stats.maxDrawdownPct.toFixed(2)}%`, 'text-[var(--color-down)]'],
        ['Drawdown length', `${stats.maxDrawdownDurationBars} bars`],
        ['Annual volatility', `${(stats.annualizedVolatility * 100).toFixed(1)}%`],
        ['Exposure', `${stats.exposurePct.toFixed(1)}%`],
      ],
    },
    {
      title: 'Quality',
      rows: [
        ['Sharpe', ratio(stats.sharpe), pnlClass(stats.sharpe)],
        ['Sortino', ratio(stats.sortino), pnlClass(stats.sortino)],
        ['Calmar', ratio(stats.calmar), pnlClass(stats.calmar)],
        ['Profit factor', ratio(stats.profitFactor), pnlClass(stats.profitFactor - 1)],
      ],
    },
    {
      title: 'Trades',
      rows: [
        ['Count', `${stats.totalTrades} (${stats.longTrades}L / ${stats.shortTrades}S)`],
        ['Win rate', `${stats.winRate.toFixed(1)}%`, pnlClass(stats.winRate - 50)],
        ['Avg win / loss', `${num(stats.averageWin)} / ${num(stats.averageLoss)}`],
        ['Expectancy', num(stats.expectancy), pnlClass(stats.expectancy)],
        ['Avg bars held', num(stats.averageBarsHeld, 1)],
        ['Fees paid', money(stats.totalFees)],
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <div
        className={`rounded-lg border px-3 py-2 text-xs ${
          beatsBenchmark
            ? 'border-[var(--color-up)]/40 bg-[var(--color-up)]/10 text-[var(--color-up)]'
            : 'border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 text-[var(--color-warn)]'
        }`}
      >
        {beatsBenchmark
          ? `Beat buy & hold by ${(stats.totalReturnPct - stats.benchmarkReturnPct).toFixed(2)} points after fees and slippage.`
          : `Did not beat buy & hold (${pct(stats.benchmarkReturnPct)}). That is the normal result — it is why the benchmark is here.`}
      </div>

      {groups.map((group) => (
        <section key={group.title}>
          <h3 className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-[var(--color-muted)] uppercase">
            {group.title}
          </h3>
          <dl className="divide-y divide-[var(--color-line)]/60">
            {group.rows.map(([label, value, cls]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 py-1">
                <dt className="text-xs text-[var(--color-muted)]">{label}</dt>
                <dd className={`tnum text-xs ${cls ?? 'text-[var(--color-ink)]'}`}>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {warnings.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-[var(--color-muted)] uppercase">
            Warnings
          </h3>
          <ul className="space-y-1">
            {warnings.map((w) => (
              <li key={w} className="text-[11px] leading-snug text-[var(--color-warn)]">
                • {w}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
