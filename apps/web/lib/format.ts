/** Shared number formatting. Kept in one place so a column never drifts. */

export const num = (n: number, digits = 2): string =>
  Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—';

export const pct = (n: number, digits = 2): string =>
  Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%` : '—';

export const ratio = (n: number): string =>
  !Number.isFinite(n) ? (n > 0 ? '∞' : '—') : n.toFixed(2);

export const money = (n: number): string =>
  Number.isFinite(n)
    ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

export const date = (sec: number): string =>
  new Date(sec * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });

export const pnlClass = (n: number): string =>
  n > 0 ? 'text-[var(--color-up)]' : n < 0 ? 'text-[var(--color-down)]' : 'text-[var(--color-muted)]';
