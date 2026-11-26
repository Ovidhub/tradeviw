'use client';

import { useState } from 'react';
import type { Trade } from '@tradeviw/core';
import { date, money, num, pct, pnlClass } from '@/lib/format';

const PAGE = 25;

const REASON_LABEL: Record<Trade['exitReason'], string> = {
  signal: 'signal',
  stop: 'stop',
  target: 'target',
  trailing: 'trailing',
  liquidation: 'liquidated',
  end: 'end of data',
};

/** Every trade, reconciled to the same fees the equity curve used. */
export function TradesTable({ trades }: { trades: Trade[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(trades.length / PAGE));
  const safePage = Math.min(page, pages - 1);
  const slice = trades.slice(safePage * PAGE, safePage * PAGE + PAGE);

  if (trades.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-[var(--color-muted)]">
        No trades — the entry conditions were never met on this data.
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-[10px] tracking-wide text-[var(--color-muted)] uppercase">
              <th className="py-1.5 pr-2 font-medium">#</th>
              <th className="py-1.5 pr-2 font-medium">Side</th>
              <th className="py-1.5 pr-2 font-medium">Entry</th>
              <th className="py-1.5 pr-2 font-medium">Exit</th>
              <th className="py-1.5 pr-2 text-right font-medium">In</th>
              <th className="py-1.5 pr-2 text-right font-medium">Out</th>
              <th className="py-1.5 pr-2 text-right font-medium">P&amp;L</th>
              <th className="py-1.5 pr-2 text-right font-medium">%</th>
              <th className="py-1.5 pr-2 text-right font-medium">Bars</th>
              <th className="py-1.5 font-medium">Exit via</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((t, i) => {
              const idx = safePage * PAGE + i + 1;
              return (
                <tr key={`${t.entryTime}-${idx}`} className="border-b border-[var(--color-line)]/40">
                  <td className="tnum py-1 pr-2 text-[var(--color-muted)]">{idx}</td>
                  <td className={`py-1 pr-2 font-semibold ${t.side === 1 ? 'text-[var(--color-up)]' : 'text-[var(--color-down)]'}`}>
                    {t.side === 1 ? 'LONG' : 'SHORT'}
                  </td>
                  <td className="tnum py-1 pr-2 text-[var(--color-muted)]">{date(t.entryTime)}</td>
                  <td className="tnum py-1 pr-2 text-[var(--color-muted)]">{date(t.exitTime)}</td>
                  <td className="tnum py-1 pr-2 text-right">{num(t.entryPrice)}</td>
                  <td className="tnum py-1 pr-2 text-right">{num(t.exitPrice)}</td>
                  <td className={`tnum py-1 pr-2 text-right ${pnlClass(t.pnl)}`}>{money(t.pnl)}</td>
                  <td className={`tnum py-1 pr-2 text-right ${pnlClass(t.pnlPct)}`}>{pct(t.pnlPct)}</td>
                  <td className="tnum py-1 pr-2 text-right text-[var(--color-muted)]">{t.barsHeld}</td>
                  <td className="py-1 text-[var(--color-muted)]">{REASON_LABEL[t.exitReason]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
          <span>
            {safePage * PAGE + 1}–{Math.min((safePage + 1) * PAGE, trades.length)} of {trades.length}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="rounded border border-[var(--color-line)] px-2 py-0.5 disabled:opacity-30"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={safePage >= pages - 1}
              className="rounded border border-[var(--color-line)] px-2 py-0.5 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
