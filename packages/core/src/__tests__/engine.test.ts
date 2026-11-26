import { describe, expect, it } from 'vitest';
import { runBacktest } from '../backtest/engine';
import { buyAndHold, smaCross } from '../backtest/strategies';
import type { Strategy } from '../backtest/types';
import { syntheticCandles } from '../data/synthetic';
import type { Candle } from '../types';

const c = (time: number, o: number, h: number, l: number, cl: number, v = 100): Candle => ({
  time,
  open: o,
  high: h,
  low: l,
  close: cl,
  volume: v,
});

/** A synthetic series where every bar is identical — makes cost math hand-checkable. */
function flatSeries(n: number, price = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => c(i * 3600, price, price, price, price));
}

/** Frictionless config: the only way to assert pure price math. */
const noCosts = {
  feeBps: 0,
  slippageBps: 0,
  initialCapital: 10_000,
  sizing: { type: 'fixed_notional' as const, notional: 10_000 },
  allowShort: true,
};

describe('backtest engine — accounting', () => {
  it('a buy & hold over a flat series returns exactly zero with no costs', () => {
    const result = runBacktest(buyAndHold(), flatSeries(50), '1h', noCosts);
    expect(result.stats.finalEquity).toBeCloseTo(10_000, 6);
    expect(result.stats.totalReturnPct).toBeCloseTo(0, 6);
    expect(result.trades).toHaveLength(1);
  });

  it('charges fees on both sides of a round trip', () => {
    const result = runBacktest(buyAndHold(), flatSeries(50), '1h', {
      ...noCosts,
      feeBps: 10, // 0.10% per side
    });
    const trade = result.trades[0]!;
    // 10k notional in + 10k out at 10 bps each = 10 + 10
    expect(trade.fees).toBeCloseTo(20, 6);
    expect(trade.pnl).toBeCloseTo(-20, 6);
  });

  it('applies slippage against the trader on both sides', () => {
    const result = runBacktest(buyAndHold(), flatSeries(50), '1h', {
      ...noCosts,
      slippageBps: 10,
    });
    const trade = result.trades[0]!;
    expect(trade.entryPrice).toBeCloseTo(100.1, 6); // paid up
    expect(trade.exitPrice).toBeCloseTo(99.9, 6); // sold down
    expect(trade.pnl).toBeLessThan(0);
  });

  it('profit equals the price move times quantity in a clean long', () => {
    const rising = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111].map((p, i) =>
      c(i * 3600, p, p, p, p),
    );
    const result = runBacktest(buyAndHold(), rising, '1h', noCosts);
    // buyAndHold signals on bar 1, so it fills at bar 2's open = 102 and exits
    // at the last close, 111. (Filling at 101 would mean trading on the signal bar.)
    const trade = result.trades[0]!;
    expect(trade.entryPrice).toBeCloseTo(102, 6);
    expect(trade.exitPrice).toBeCloseTo(111, 6);
    // qty = notional / entry, so P&L must equal that exact scaling.
    expect(trade.pnl).toBeCloseTo((10_000 / 102) * (111 - 102), 6);
  });
});

describe('backtest engine — no lookahead', () => {
  it('never fills a signal on the bar that produced it', () => {
    const candles = flatSeries(20);
    let entryBarIndex = -1;
    let signalBarIndex = -1;
    const spy: Strategy = {
      name: 'lookahead spy',
      onBar(ctx) {
        if (ctx.index === 5) {
          signalBarIndex = ctx.index;
          ctx.buy();
        }
        if (ctx.position && entryBarIndex === -1) entryBarIndex = ctx.index;
      },
    };
    runBacktest(spy, candles, '1h', noCosts);
    expect(signalBarIndex).toBe(5);
    expect(entryBarIndex).toBe(6); // filled on the next bar, never the same one
  });

  it('cannot use the current bar close to fill at the current bar open', () => {
    // Bar 5 closes at 999 but only trades 100–101. If the engine were leaking the
    // close, the fill price would be near 999.
    const candles = flatSeries(12);
    candles[5] = c(5 * 3600, 100, 101, 100, 999);
    const result = runBacktest(
      {
        name: 'fill price probe',
        onBar(ctx) {
          if (ctx.index === 4) ctx.buy();
        },
      },
      candles,
      '1h',
      noCosts,
    );
    expect(result.trades[0]!.entryPrice).toBeCloseTo(100, 6);
  });
});

describe('backtest engine — protective orders', () => {
  /** Enters long at bar 1, then price collapses through the stop on bar 3. */
  const stopScenario = [
    c(0, 100, 100, 100, 100),
    c(3600, 100, 100, 100, 100),
    c(7200, 100, 101, 99, 100),
    c(10_800, 100, 100, 80, 82),
    c(14_400, 82, 82, 82, 82),
    c(18_000, 82, 82, 82, 82),
    c(21_600, 82, 82, 82, 82),
    c(25_200, 82, 82, 82, 82),
    c(28_800, 82, 82, 82, 82),
    c(32_400, 82, 82, 82, 82),
    c(36_000, 82, 82, 82, 82),
    c(39_600, 82, 82, 82, 82),
  ];

  it('exits at the stop level when the bar range contains it', () => {
    const result = runBacktest(
      {
        name: 'stop test',
        onBar(ctx) {
          if (ctx.index === 1 && !ctx.position) ctx.buy({ stopLoss: 90 });
        },
      },
      stopScenario,
      '1h',
      noCosts,
    );
    const trade = result.trades[0]!;
    expect(trade.exitReason).toBe('stop');
    expect(trade.exitPrice).toBeCloseTo(90, 6);
  });

  it('fills at the open when the bar gaps through the stop', () => {
    const gap = [...stopScenario.slice(0, 3), c(10_800, 60, 61, 59, 60), ...stopScenario.slice(4)];
    const result = runBacktest(
      {
        name: 'gap test',
        onBar(ctx) {
          if (ctx.index === 1 && !ctx.position) ctx.buy({ stopLoss: 90 });
        },
      },
      gap,
      '1h',
      noCosts,
    );
    expect(result.trades[0]!.exitPrice).toBeCloseTo(60, 6); // not 90 — no fantasy fills
  });

  it('assumes the stop is hit first when one bar spans stop and target', () => {
    const wide = [...stopScenario.slice(0, 3), c(10_800, 100, 200, 50, 100), ...stopScenario.slice(4)];
    const strategy: Strategy = {
      name: 'both levels',
      onBar(ctx) {
        if (ctx.index === 1 && !ctx.position) ctx.buy({ stopLoss: 90, takeProfit: 110 });
      },
    };
    const pessimistic = runBacktest(strategy, wide, '1h', { ...noCosts, intrabarPriority: 'stop-first' });
    const optimistic = runBacktest(strategy, wide, '1h', { ...noCosts, intrabarPriority: 'target-first' });
    expect(pessimistic.trades[0]!.exitReason).toBe('stop');
    expect(optimistic.trades[0]!.exitReason).toBe('target');
  });

  it('ratchets a trailing stop and never lets it loosen', () => {
    const climbThenFall = [
      c(0, 100, 100, 100, 100),
      c(3600, 100, 100, 100, 100),
      c(7200, 100, 120, 100, 120),
      c(10_800, 120, 130, 119, 130),
      c(14_400, 130, 131, 105, 106),
      c(18_000, 106, 106, 106, 106),
      c(21_600, 106, 106, 106, 106),
      c(25_200, 106, 106, 106, 106),
      c(28_800, 106, 106, 106, 106),
      c(32_400, 106, 106, 106, 106),
      c(36_000, 106, 106, 106, 106),
      c(39_600, 106, 106, 106, 106),
    ];
    const result = runBacktest(
      {
        name: 'trailing',
        onBar(ctx) {
          if (ctx.index === 1 && !ctx.position) ctx.buy({ trailingStop: 10 });
        },
      },
      climbThenFall,
      '1h',
      noCosts,
    );
    // Signal on bar 1 → entry at bar 2's open (100). The stop arms on bar 2 and is
    // live from bar 3: bar 3's high of 130 lifts it to 120, and its low of 119 hits
    // it. Exit at 120, not at the later 105 — a real fill the bar could support.
    const trade = result.trades[0]!;
    expect(trade.exitPrice).toBeCloseTo(120, 6);
    expect(trade.exitReason).toBe('stop');
    expect(trade.pnl).toBeGreaterThan(0);
  });

  it('regression: a trailing stop set on the entry bar cannot fill at that bar', () => {
    // The entry bar rises to 120 after opening at 100. A trailing stop of 10 is
    // lifted to 110 by that same high, but the bar itself traded up from 100 —
    // there is no moment at which 110 was hit *after* the stop existed.
    const candles = [
      c(0, 100, 100, 100, 100),
      c(3600, 100, 100, 100, 100),
      c(7200, 100, 120, 100, 120), // entry bar: opens 100, runs to 120
      c(10_800, 120, 121, 119, 120),
      c(14_400, 120, 120, 120, 120),
      c(18_000, 120, 120, 120, 120),
      c(21_600, 120, 120, 120, 120),
      c(25_200, 120, 120, 120, 120),
      c(28_800, 120, 120, 120, 120),
      c(32_400, 120, 120, 120, 120),
    ];
    const result = runBacktest(
      {
        name: 'entry-bar regression',
        onBar(ctx) {
          if (ctx.index === 1 && !ctx.position) ctx.buy({ trailingStop: 10 });
        },
      },
      candles,
      '1h',
      noCosts,
    );
    const trade = result.trades[0]!;
    expect(trade.entryTime).toBe(7200); // entered on the signal's next bar
    expect(trade.exitTime).toBeGreaterThan(7200); // never closed on the entry bar
    // Price peaks at 121 and holds 120, so a 10-wide trail is never breached:
    // the position runs to the end of data rather than inventing an exit.
    expect(trade.exitReason).toBe('end');
    expect(trade.exitPrice).toBeCloseTo(120, 6);
  });
});

describe('backtest engine — sizing and leverage', () => {
  it('caps notional exposure at equity × leverage', () => {
    const result = runBacktest(buyAndHold(), flatSeries(30), '1h', {
      ...noCosts,
      leverage: 2,
      sizing: { type: 'percent_equity', percent: 1000 },
    });
    const trade = result.trades[0]!;
    expect(trade.qty * trade.entryPrice).toBeLessThanOrEqual(20_000 + 1e-6);
  });

  it('risk_percent sizing gives a loss close to the requested risk', () => {
    const candles = [
      c(0, 100, 100, 100, 100),
      c(3600, 100, 100, 100, 100),
      c(7200, 100, 100, 100, 100),
      c(10_800, 100, 100, 90, 90),
      c(14_400, 90, 90, 90, 90),
      c(18_000, 90, 90, 90, 90),
      c(21_600, 90, 90, 90, 90),
      c(25_200, 90, 90, 90, 90),
      c(28_800, 90, 90, 90, 90),
      c(32_400, 90, 90, 90, 90),
      c(36_000, 90, 90, 90, 90),
      c(39_600, 90, 90, 90, 90),
    ];
    const result = runBacktest(
      {
        name: 'risk sizing',
        onBar(ctx) {
          if (ctx.index === 1 && !ctx.position) ctx.buy({ stopLoss: 95 }); // 5% risk distance
        },
      },
      candles,
      '1h',
      { ...noCosts, initialCapital: 10_000, sizing: { type: 'risk_percent', percent: 2 } },
    );
    const trade = result.trades[0]!;
    // 2% of 10k = 200 at risk; stop 100→95 so qty ≈ 40; loss ≈ 200 (minus levity)
    expect(trade.pnl).toBeLessThan(0);
    expect(trade.pnl).toBeCloseTo(-200, 0);
  });

  it('blocks shorts when allowShort is false', () => {
    const result = runBacktest(
      {
        name: 'short blocked',
        onBar(ctx) {
          if (ctx.index === 1) ctx.sell();
        },
      },
      flatSeries(20),
      '1h',
      { ...noCosts, allowShort: false },
    );
    expect(result.trades).toHaveLength(0);
  });
});

describe('backtest engine — reports', () => {
  it('produces an equity curve aligned to the bars and a benchmark', () => {
    const candles = syntheticCandles({ bars: 300, startTime: 0, timeframe: '1h', seed: 'curve' });
    const result = runBacktest(smaCross(10, 30), candles, '1h', { initialCapital: 10_000, allowShort: true });
    expect(result.equity).toHaveLength(candles.length);
    expect(result.equity[0]!.benchmark).toBeCloseTo(10_000, 6);
    expect(result.stats.benchmarkReturnPct).toBeCloseTo(
      (candles.at(-1)!.close / candles[0]!.close - 1) * 100,
      4,
    );
  });

  it('never reports a positive drawdown and tracks max drawdown', () => {
    const candles = syntheticCandles({ bars: 500, startTime: 0, timeframe: '1D', seed: 'dd' });
    const result = runBacktest(smaCross(10, 30), candles, '1D', { initialCapital: 10_000, allowShort: true });
    for (const p of result.equity) expect(p.drawdownPct).toBeLessThanOrEqual(1e-9);
    expect(result.stats.maxDrawdownPct).toBeLessThanOrEqual(0);
  });

  it('warns instead of pretending when a strategy never trades', () => {
    const result = runBacktest(
      { name: 'never trades', onBar() {} },
      flatSeries(50),
      '1h',
      noCosts,
    );
    expect(result.trades).toHaveLength(0);
    expect(result.warnings.join(' ')).toMatch(/never opened a trade/);
    expect(result.stats.finalEquity).toBeCloseTo(10_000, 6);
  });

  it('is deterministic: same input, same output', () => {
    const candles = syntheticCandles({ bars: 400, startTime: 0, timeframe: '4h', seed: 'determinism' });
    const a = runBacktest(smaCross(20, 50), candles, '4h', { allowShort: true });
    const b = runBacktest(smaCross(20, 50), candles, '4h', { allowShort: true });
    expect(a.stats.finalEquity).toBe(b.stats.finalEquity);
    expect(a.trades).toEqual(b.trades);
  });

  it('refuses to run on a series too short to mean anything', () => {
    expect(() => runBacktest(buyAndHold(), flatSeries(5), '1h')).toThrow(/at least 10 bars/);
  });
});

describe('full strategy library', () => {
  it('runs every preset over 2000 synthetic bars without throwing', async () => {
    const { strategyLibrary } = await import('../backtest/strategies');
    const candles = syntheticCandles({
      bars: 2000,
      startTime: 1_600_000_000,
      timeframe: '1h',
      seed: 'library',
    });
    for (const strategy of strategyLibrary()) {
      const result = runBacktest(strategy, candles, '1h', { allowShort: true });
      expect(Number.isFinite(result.stats.finalEquity)).toBe(true);
      expect(result.equity).toHaveLength(candles.length);
      expect(result.runtimeMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('runs 2000 bars of an ATR strategy in well under a second', async () => {
    const { emaCrossAtr } = await import('../backtest/strategies');
    const candles = syntheticCandles({
      bars: 2000,
      startTime: 1_600_000_000,
      timeframe: '1h',
      seed: 'perf',
    });
    const result = runBacktest(emaCrossAtr(), candles, '1h', { allowShort: true });
    expect(result.runtimeMs).toBeLessThan(500);
  });
});
