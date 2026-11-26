'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BacktestResult, CandleSeries } from '@tradeviw/core';
import { loadSeries } from '@/lib/loadMarketData';
import { num, pct, pnlClass } from '@/lib/format';
import { DataBadge } from './DataBadge';
import { PriceChart } from './PriceChart';
import { EquityChart } from './EquityChart';
import { StatsPanel } from './StatsPanel';
import { TradesTable } from './TradesTable';
import { Controls, DEFAULT_SETTINGS, toBacktestConfig, type RunSettings } from './Controls';
import type { BacktestRequest, BacktestResponse } from '@/workers/backtest.worker';

type Tab = 'stats' | 'trades';

export function Workspace() {
  const [settings, setSettings] = useState<RunSettings>(DEFAULT_SETTINGS);
  const [series, setSeries] = useState<CandleSeries | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('stats');

  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);

  // ---- Worker lifecycle: one per page, terminated on unmount ----
  useEffect(() => {
    const worker = new Worker(new URL('../workers/backtest.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<BacktestResponse>) => {
      const msg = event.data;
      if (msg.id !== reqId.current) return; // stale run
      setBusy(false);
      if (msg.ok) {
        setResults(msg.results);
        setSelected(0);
        setRunError(null);
      } else {
        setRunError(msg.error);
      }
    };
    worker.onerror = () => {
      setBusy(false);
      setRunError('The backtest worker failed to start. Reload the page.');
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // ---- Load data whenever symbol / timeframe / history depth changes ----
  const load = useCallback(async (s: RunSettings) => {
    setLoading(true);
    setLoadError(null);
    setFallbackReason(null);
    setResults([]);
    try {
      const { series: loaded, fallbackReason: reason } = await loadSeries({
        symbolId: s.symbolId,
        timeframe: s.timeframe,
        bars: s.bars,
      });
      setSeries(loaded);
      setFallbackReason(reason ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setSeries(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(settings);
    // Re-fetch only for the inputs that change the dataset, not for cost settings.
  }, [load, settings.symbolId, settings.timeframe, settings.bars]);

  const run = useCallback(() => {
    if (!workerRef.current || !series) return;
    setBusy(true);
    reqId.current += 1;
    const request: BacktestRequest = {
      id: reqId.current,
      candles: series.candles,
      timeframe: settings.timeframe,
      config: toBacktestConfig(settings),
    };
    workerRef.current.postMessage(request);
  }, [series, settings]);

  // Auto-run once data arrives: an empty backtest panel is a worse first impression.
  useEffect(() => {
    if (series && results.length === 0 && !loading && !busy) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, loading]);

  const current = results[selected] ?? null;
  const last = series?.candles.at(-1);
  const first = series?.candles[0];

  const changePct = useMemo(() => {
    if (!last || !first || series!.candles.length < 2) return null;
    const prev = series!.candles[series!.candles.length - 2]!;
    return ((last.close - prev.close) / prev.close) * 100;
  }, [series, last]);

  const best = useMemo(
    () => results.reduce<BacktestResult | null>((a, b) => (!a || b.stats.totalReturnPct > a.stats.totalReturnPct ? b : a), null),
    [results],
  );

  return (
    <div className="flex min-h-screen flex-col">
      {/* ---- Header ---- */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded bg-[var(--color-accent)] text-[13px] font-black text-[#04231b]">
              t
            </span>
            <span className="text-sm font-semibold tracking-tight">tradeviw</span>
          </div>
          <span className="hidden rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)] sm:inline">
            Phase 1 · free, forever
          </span>
        </div>

        {series && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-[var(--color-muted)]">{series.symbol.ticker}</span>
              {last && (
                <>
                  <span className="tnum text-base font-semibold">{num(last.close)}</span>
                  {changePct !== null && (
                    <span className={`tnum text-xs ${pnlClass(changePct)}`}>{pct(changePct)}</span>
                  )}
                </>
              )}
            </div>
            <DataBadge provenance={series.provenance} />
          </div>
        )}
      </header>

      {/* ---- Body ---- */}
      <div className="grid flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        {/* Left: controls */}
        <aside className="panel order-2 h-fit p-3 lg:order-1" aria-label="Backtest settings">
          <h2 className="mb-3 text-xs font-semibold">Backtest settings</h2>
          <Controls
            settings={settings}
            onChange={setSettings}
            onRun={run}
            busy={busy}
            disabled={loading || !series}
          />
        </aside>

        {/* Center: chart + equity */}
        <main className="order-1 flex min-w-0 flex-col gap-3 lg:order-2">
          {loadError && (
            <div className="panel border-[var(--color-down)]/40 p-3 text-xs text-[var(--color-down)]">
              Could not load market data: {loadError}
            </div>
          )}

          {fallbackReason && !loading && (
            <div className="panel border-[var(--color-warn)]/40 p-2.5 text-[11px] leading-relaxed text-[var(--color-warn)]">
              <strong>Live data unavailable.</strong> Falling back to the demo dataset.{' '}
              <span className="opacity-70">({fallbackReason})</span>
            </div>
          )}

          <section className="panel flex min-h-[320px] flex-1 flex-col overflow-hidden lg:min-h-[380px]" aria-label="Price chart">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-1.5">
              <h2 className="text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                Price
              </h2>
              {current && (
                <span className="text-[10px] text-[var(--color-muted)]">
                  {current.trades.length} markers plotted
                </span>
              )}
            </div>
            <div className="flex-1 p-1">
              {loading ? (
                <ChartSkeleton label="Loading market data…" />
              ) : series ? (
                <PriceChart series={series} trades={current?.trades ?? []} />
              ) : (
                <ChartSkeleton label="No data" />
              )}
            </div>
          </section>

          <section className="panel flex min-h-[220px] flex-col overflow-hidden" aria-label="Equity curve">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-1.5">
              <h2 className="text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                Equity curve &amp; drawdown
              </h2>
              {current && (
                <span className={`tnum text-[11px] ${pnlClass(current.stats.totalReturnPct)}`}>
                  {pct(current.stats.totalReturnPct)}
                </span>
              )}
            </div>
            <div className="h-[200px] p-1">
              {current ? <EquityChart equity={current.equity} /> : <ChartSkeleton label="Run a backtest" />}
            </div>
          </section>
        </main>

        {/* Right: results */}
        <aside className="panel order-3 flex h-fit flex-col p-3" aria-label="Backtest results">
          {runError && (
            <div className="mb-2 rounded border border-[var(--color-down)]/40 p-2 text-[11px] text-[var(--color-down)]">
              {runError}
            </div>
          )}

          {results.length > 0 && (
            <>
              <div className="mb-2">
                <label htmlFor="strategy" className="mb-1 block text-[10px] font-semibold tracking-[0.1em] text-[var(--color-muted)] uppercase">
                  Strategy
                </label>
                <select
                  id="strategy"
                  className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1.5 text-xs"
                  value={selected}
                  onChange={(e) => setSelected(Number(e.target.value))}
                >
                  {results.map((r, i) => (
                    <option key={r.strategy} value={i}>
                      {r.strategy} · {pct(r.stats.totalReturnPct)}
                    </option>
                  ))}
                </select>
                {best && results.length > 1 && (
                  <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                    Best on this data: <span className="text-[var(--color-ink)]">{best.strategy}</span>
                  </p>
                )}
              </div>

              <div className="mb-2 flex gap-1" role="tablist" aria-label="Results view">
                {(['stats', 'trades'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition ${
                      tab === t
                        ? 'bg-[var(--color-panel-2)] text-[var(--color-ink)]'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                    }`}
                  >
                    {t === 'stats' ? 'Metrics' : `Trades (${current?.trades.length ?? 0})`}
                  </button>
                ))}
              </div>

              <div className="max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
                {current &&
                  (tab === 'stats' ? (
                    <StatsPanel stats={current.stats} warnings={current.warnings} />
                  ) : (
                    <TradesTable trades={current.trades} />
                  ))}
              </div>

              <p className="mt-3 border-t border-[var(--color-line)] pt-2 text-[10px] leading-relaxed text-[var(--color-muted)]">
                Computed in {current?.runtimeMs ?? 0} ms over {series?.candles.length.toLocaleString()} bars.
                Past performance does not predict future results. Not financial advice.
              </p>
            </>
          )}

          {results.length === 0 && !busy && !runError && (
            <p className="py-6 text-center text-xs text-[var(--color-muted)]">
              {loading ? 'Loading data…' : 'Run a backtest to see metrics.'}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function ChartSkeleton({ label }: { label: string }) {
  return (
    <div className="grid h-full min-h-[160px] place-items-center">
      <div className="flex flex-col items-center gap-2">
        <div className="h-1 w-32 animate-pulse rounded bg-[var(--color-line)]" />
        <div className="h-1 w-24 animate-pulse rounded bg-[var(--color-line)]" />
        <span className="mt-1 text-[10px] text-[var(--color-muted)]">{label}</span>
      </div>
    </div>
  );
}
