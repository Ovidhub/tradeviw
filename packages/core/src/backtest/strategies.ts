import type { Candle } from '../types';
import {
  atr,
  donchian,
  ema,
  macd,
  rsi,
  sma,
  type Series,
} from '../indicators/index';
import type { Strategy } from './types';

/**
 * Reference strategies.
 *
 * These are the fixtures the engine is tested against and the presets a new
 * user lands on. Each is intentionally simple and honest about its assumptions —
 * none of them look ahead, and none of them are "the profitable one".
 */

/** Helper: previous value of a series, null-safe. */
const prev = (s: Series, i: number): number | null => (i > 0 ? (s[i - 1] ?? null) : null);
const cur = (s: Series, i: number): number | null => s[i] ?? null;

/** 1. SMA crossover: long when fast crosses above slow, flat when it crosses back. */
export function smaCross(fast = 20, slow = 50): Strategy {
  return {
    name: `SMA crossover (${fast}/${slow})`,
    description: 'Trend following. Buys when the fast SMA crosses above the slow SMA, exits on the reverse cross.',
    prepare(candles: readonly Candle[]) {
      const closes = candles.map((c) => c.close);
      return { fast: sma(closes, fast), slow: sma(closes, slow) };
    },
    onBar(ctx) {
      const i = ctx.index;
      const f = cur(ctx.series.fast!, i);
      const s = cur(ctx.series.slow!, i);
      const pf = prev(ctx.series.fast!, i);
      const ps = prev(ctx.series.slow!, i);
      if (f === null || s === null || pf === null || ps === null) return;

      const crossedUp = pf <= ps && f > s;
      const crossedDown = pf >= ps && f < s;

      if (crossedUp && !ctx.position) ctx.buy();
      else if (crossedDown && ctx.position?.side === 1) ctx.close();
      else if (crossedDown && !ctx.position) ctx.sell();
      else if (crossedUp && ctx.position?.side === -1) ctx.close();
    },
  };
}

/** 2. EMA crossover with an ATR stop and a 2R target — the close-to-realistic benchmark. */
export function emaCrossAtr(fast = 12, slow = 26, atrPeriod = 14, atrMult = 2): Strategy {
  return {
    name: `EMA crossover + ATR stop (${fast}/${slow}, ${atrMult}×ATR)`,
    description: 'Trend following with risk defined by volatility. Stop at 2×ATR, target at 4×ATR.',
    prepare(candles: readonly Candle[]) {
      const closes = candles.map((c) => c.close);
      return { fast: ema(closes, fast), slow: ema(closes, slow), atr: atr(candles, atrPeriod) };
    },
    onBar(ctx) {
      const i = ctx.index;
      const f = cur(ctx.series.fast!, i);
      const s = cur(ctx.series.slow!, i);
      const a = cur(ctx.series.atr!, i);
      if (f === null || s === null || !!a && a <= 0) return;
      if (a === null) return;

      if (!ctx.position) {
        if (f > s) ctx.buy({ stopLoss: ctx.candle.close - atrMult * a, takeProfit: ctx.candle.close + atrMult * 2 * a });
        else ctx.sell({ stopLoss: ctx.candle.close + atrMult * a, takeProfit: ctx.candle.close - atrMult * 2 * a });
      } else if (ctx.position.side === 1 && f < s) {
        ctx.close();
      } else if (ctx.position.side === -1 && f > s) {
        ctx.close();
      }
    },
  };
}

/** 3. Donchian breakout: buy the N-bar high, exit the M-bar low (turtle-ish). */
export function donchianBreakout(entry = 20, exit = 10): Strategy {
  return {
    name: `Donchian breakout (${entry}/${exit})`,
    description: 'Buys a break of the 20-bar high, exits on a break of the 10-bar low. Stops placed at the opposite band.',
    prepare(candles: readonly Candle[]) {
      const highs = candles.map((c) => c.high);
      const lows = candles.map((c) => c.low);
      return { upper: donchian(candles, entry).upper, lower: donchian(candles, exit).lower, highs: highs as Series, lows: lows as Series };
    },
    onBar(ctx) {
      const i = ctx.index;
      const up = prev(ctx.series.upper!, i); // previous bar's band: no lookahead
      const dn = prev(ctx.series.lower!, i);
      if (up === null || dn === null) return;
      const c = ctx.candle;

      if (!ctx.position) {
        if (c.close > up) ctx.buy({ stopLoss: dn });
        else if (c.close < dn) ctx.sell({ stopLoss: up });
      } else if (ctx.position.side === 1 && c.close < dn) {
        ctx.close();
      } else if (ctx.position.side === -1 && c.close > up) {
        ctx.close();
      }
    },
  };
}

/** 4. RSI mean reversion: buy oversold, sell overbought, with ATR stops. */
export function rsiMeanReversion(period = 14, oversold = 30, overbought = 70, atrMult = 2): Strategy {
  return {
    name: `RSI mean reversion (${period}, ${oversold}/${overbought})`,
    description: 'Counter-trend. Buys oversold, sells overbought, with 2×ATR stops.',
    prepare(candles: readonly Candle[]) {
      return { rsi: rsi(candles.map((c) => c.close), period), atr: atr(candles, 14) };
    },
    onBar(ctx) {
      const i = ctx.index;
      const r = cur(ctx.series.rsi!, i);
      const a = cur(ctx.series.atr!, i);
      if (r === null || a === null) return;

      if (!ctx.position) {
        if (r < oversold) ctx.buy({ stopLoss: ctx.candle.close - atrMult * a, takeProfit: ctx.candle.close + atrMult * 2 * a });
        else if (r > overbought) ctx.sell({ stopLoss: ctx.candle.close + atrMult * a, takeProfit: ctx.candle.close - atrMult * 2 * a });
      } else if (ctx.position.side === 1 && r > 50) {
        ctx.close();
      } else if (ctx.position.side === -1 && r < 50) {
        ctx.close();
      }
    },
  };
}

/** 5. MACD: classic histogram-flip entry with a trailing stop. */
export function macdTrend(fast = 12, slow = 26, signal = 9, trailAtr = 3): Strategy {
  return {
    name: `MACD trend + trailing stop (${fast}/${slow}/${signal})`,
    description: 'Long while MACD is above its signal line, with a 3×ATR trailing stop.',
    prepare(candles: readonly Candle[]) {
      const closes = candles.map((c) => c.close);
      const m = macd(closes, fast, slow, signal);
      return { macd: m.macd, signal: m.signal, atr: atr(candles, 14) };
    },
    onBar(ctx) {
      const i = ctx.index;
      const m = cur(ctx.series.macd!, i);
      const s = cur(ctx.series.signal!, i);
      const a = cur(ctx.series.atr!, i);
      if (m === null || s === null || a === null) return;

      if (!ctx.position) {
        if (m > s) ctx.buy({ trailingStop: trailAtr * a });
        else if (m < s) ctx.sell({ trailingStop: trailAtr * a });
      } else if (ctx.position.side === 1 && m < s) {
        ctx.close();
      } else if (ctx.position.side === -1 && m > s) {
        ctx.close();
      }
    },
  };
}

/** 6. Buy & hold — the benchmark every strategy must beat to be worth running. */
export function buyAndHold(): Strategy {
  return {
    name: 'Buy & hold',
    description: 'Buys once and never sells. If a strategy cannot beat this, it is not adding value.',
    onBar(ctx) {
      if (ctx.index === 1 && !ctx.position) ctx.buy();
    },
  };
}

/** All presets, in the order they should appear in the UI. */
export function strategyLibrary(): Strategy[] {
  return [
    smaCross(20, 50),
    emaCrossAtr(12, 26),
    donchianBreakout(20, 10),
    rsiMeanReversion(),
    macdTrend(),
    buyAndHold(),
  ];
}
