import { describe, expect, it, vi } from 'vitest';
import { runBacktest, smaCross } from '@tradeviw/core';
import { loadSeries, syntheticSeries } from '../loadMarketData';

/**
 * Integration test for the client-side data path.
 *
 * These exercise the same functions the browser runs: fetch from Binance with a
 * synthetic fallback, then feed the result straight into the backtester. If this
 * passes, the UI's numbers are real computations rather than fixtures.
 */

describe('loadSeries — offline behaviour', () => {
  it('falls back to a clearly-labelled synthetic series when the network fails', async () => {
    const boom = vi.fn().mockRejectedValue(new Error('network blocked'));
    vi.stubGlobal('fetch', boom);

    const { series, fallbackReason } = await loadSeries({
      symbolId: 'BINANCE:BTCUSDT',
      timeframe: '1h',
      bars: 300,
    });

    expect(fallbackReason).toMatch(/network blocked/);
    expect(series.provenance.synthetic).toBe(true);
    expect(series.provenance.label).toMatch(/synthetic/i);
    expect(series.candles).toHaveLength(300);

    vi.unstubAllGlobals();
  });

  it('never presents a fallback series as live data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { series } = await loadSeries({
      symbolId: 'BINANCE:ETHUSDT',
      timeframe: '4h',
      bars: 120,
    });
    expect(series.provenance.source).toBe('synthetic');
    expect(series.provenance.synthetic).toBe(true);
    expect(series.provenance.label).not.toMatch(/real-time/i);
    vi.unstubAllGlobals();
  });

  it('produces a usable, ordered series with sane OHLC on every bar', async () => {
    const series = await syntheticSeries('BINANCE:BTCUSDT', 'BTCUSDT', '1D', 500);
    expect(series.candles).toHaveLength(500);
    for (let i = 1; i < series.candles.length; i++) {
      expect(series.candles[i]!.time).toBeGreaterThan(series.candles[i - 1]!.time);
    }
    for (const c of series.candles) {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      expect(c.volume).toBeGreaterThan(0);
    }
  });
});

describe('loadSeries → backtest end to end', () => {
  it('runs a full backtest on a loaded series with finite, reconcilable numbers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { series } = await loadSeries({
      symbolId: 'BINANCE:BTCUSDT',
      timeframe: '4h',
      bars: 800,
    });
    vi.unstubAllGlobals();

    const result = runBacktest(smaCross(20, 50), series.candles, series.timeframe, {
      initialCapital: 10_000,
      feeBps: 10,
      slippageBps: 5,
      allowShort: true,
    });

    expect(result.equity).toHaveLength(series.candles.length);
    expect(Number.isFinite(result.stats.finalEquity)).toBe(true);
    expect(result.stats.finalEquity).toBeGreaterThan(0);
    // The equity curve is the source of truth for the headline number.
    expect(result.stats.finalEquity).toBeCloseTo(result.equity.at(-1)!.equity, 6);
    // Trades must reconcile to the fees reported in stats.
    const tradeFees = result.trades.reduce((a, t) => a + t.fees, 0);
    expect(result.stats.totalFees).toBeCloseTo(tradeFees, 6);
  });
});
