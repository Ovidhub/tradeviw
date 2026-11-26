'use client';

import { TIMEFRAMES, type BacktestConfig, type Timeframe } from '@tradeviw/core';
import { SYMBOLS } from '@/lib/loadMarketData';

export interface RunSettings {
  symbolId: string;
  timeframe: Timeframe;
  bars: number;
  capital: number;
  feeBps: number;
  slippageBps: number;
  leverage: number;
  allowShort: boolean;
}

export const DEFAULT_SETTINGS: RunSettings = {
  symbolId: 'BINANCE:BTCUSDT',
  timeframe: '4h',
  bars: 2000,
  capital: 10_000,
  feeBps: 10,
  slippageBps: 5,
  leverage: 1,
  allowShort: true,
};

const BAR_CHOICES = [500, 1000, 2000, 5000] as const;

const field =
  'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1.5 text-xs text-[var(--color-ink)] outline-none transition hover:border-[#3a4353]';
const labelCls = 'mb-1 block text-[10px] font-semibold tracking-[0.1em] text-[var(--color-muted)] uppercase';

export function Controls({
  settings,
  onChange,
  onRun,
  busy,
  disabled,
}: {
  settings: RunSettings;
  onChange: (next: RunSettings) => void;
  onRun: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  const set = <K extends keyof RunSettings>(key: K, value: RunSettings[K]) =>
    onChange({ ...settings, [key]: value });

  const n = (e: React.ChangeEvent<HTMLInputElement>, fallback: number) => {
    const v = Number(e.target.value);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls} htmlFor="symbol">
            Symbol
          </label>
          <select
            id="symbol"
            className={field}
            value={settings.symbolId}
            onChange={(e) => set('symbolId', e.target.value)}
          >
            {SYMBOLS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="timeframe">
            Timeframe
          </label>
          <select
            id="timeframe"
            className={field}
            value={settings.timeframe}
            onChange={(e) => set('timeframe', e.target.value as Timeframe)}
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="bars">
          History bars
        </label>
        <select
          id="bars"
          className={field}
          value={settings.bars}
          onChange={(e) => set('bars', Number(e.target.value))}
        >
          {BAR_CHOICES.map((b) => (
            <option key={b} value={b}>
              {b.toLocaleString()} bars
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls} htmlFor="capital">
            Capital ($)
          </label>
          <input
            id="capital"
            type="number"
            min={100}
            step={1000}
            className={field}
            value={settings.capital}
            onChange={(e) => set('capital', n(e, 10_000))}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="fee">
            Fee (bps/side)
          </label>
          <input
            id="fee"
            type="number"
            min={0}
            max={200}
            className={field}
            value={settings.feeBps}
            onChange={(e) => set('feeBps', n(e, 10))}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="slippage">
            Slippage (bps)
          </label>
          <input
            id="slippage"
            type="number"
            min={0}
            max={200}
            className={field}
            value={settings.slippageBps}
            onChange={(e) => set('slippageBps', n(e, 5))}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="leverage">
            Leverage
          </label>
          <select
            id="leverage"
            className={field}
            value={settings.leverage}
            onChange={(e) => set('leverage', Number(e.target.value))}
          >
            {[1, 2, 3, 5, 10].map((l) => (
              <option key={l} value={l}>
                {l}×
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--color-muted)]">
        <input
          type="checkbox"
          checked={settings.allowShort}
          onChange={(e) => set('allowShort', e.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--color-accent)]"
        />
        Allow short positions
      </label>

      <button
        type="button"
        onClick={onRun}
        disabled={busy || disabled}
        className="w-full rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[#04231b] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Running…' : 'Run backtest'}
      </button>

      <p className="text-[10px] leading-relaxed text-[var(--color-muted)]">
        Fees and slippage are charged on both sides of every trade. Fills happen on the bar after a
        signal, never the bar that produced it.
      </p>
    </div>
  );
}

export function toBacktestConfig(s: RunSettings): Partial<BacktestConfig> {
  return {
    initialCapital: s.capital,
    feeBps: s.feeBps,
    slippageBps: s.slippageBps,
    leverage: s.leverage,
    allowShort: s.allowShort,
    sizing: { type: 'percent_equity', percent: 95 },
  };
}
