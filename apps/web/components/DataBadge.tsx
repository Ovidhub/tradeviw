import type { DataProvenance } from '@tradeviw/core';

/**
 * The honesty component.
 *
 * Every price in this product carries one of these. A synthetic dataset must be
 * impossible to mistake for a live feed — that single rule is what separates an
 * honest free platform from a misleading one.
 */
export function DataBadge({ provenance }: { provenance: DataProvenance }) {
  const age = provenance.delayMs;
  const status = provenance.synthetic
    ? { dot: 'bg-[var(--color-warn)]', text: 'text-[var(--color-warn)]', label: 'SYNTHETIC DATA' }
    : age === 0
      ? { dot: 'bg-[var(--color-accent)]', text: 'text-[var(--color-accent)]', label: 'LIVE' }
      : { dot: 'bg-[var(--color-warn)]', text: 'text-[var(--color-warn)]', label: `DELAYED ${Math.round(age / 60000)}m` };

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"
      title={provenance.label}
      role="status"
      aria-live="polite"
    >
      <span className={`flex items-center gap-1.5 font-semibold tracking-wide ${status.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
        {status.label}
      </span>
      <span className="text-[var(--color-muted)]">·</span>
      <span className="text-[var(--color-muted)]">{provenance.label}</span>
      {provenance.synthetic && (
        <span className="rounded bg-[var(--color-warn)]/10 px-1.5 py-0.5 text-[10px] text-[var(--color-warn)] ring-1 ring-[var(--color-warn)]/30">
          not real market prices — results are illustrative only
        </span>
      )}
    </div>
  );
}
