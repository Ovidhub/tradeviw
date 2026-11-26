/// <reference lib="webworker" />
import {
  runBacktest,
  strategyLibrary,
  type BacktestConfig,
  type BacktestResult,
  type Candle,
  type Timeframe,
} from '@tradeviw/core';

/**
 * Backtests run off the main thread.
 *
 * A 50k-bar run is fast (tens of ms) but a user dragging a parameter slider will
 * fire dozens of them. Keeping them off the main thread is what stops the chart
 * from stuttering while the numbers update.
 */

export interface BacktestRequest {
  id: number;
  candles: Candle[];
  timeframe: Timeframe;
  strategyName?: string;
  config: Partial<BacktestConfig>;
}

export type BacktestResponse =
  | { id: number; ok: true; results: BacktestResult[] }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<BacktestRequest>) => {
  const { id, candles, timeframe, strategyName, config } = event.data;
  try {
    const library = strategyLibrary();
    const chosen = strategyName
      ? library.filter((s) => s.name === strategyName)
      : library;
    const results = chosen.map((strategy) => runBacktest(strategy, candles, timeframe, config));
    const response: BacktestResponse = { id, ok: true, results };
    ctx.postMessage(response);
  } catch (err) {
    const response: BacktestResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(response);
  }
});
