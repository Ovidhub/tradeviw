import type { Candle, Timeframe } from '../types';
import { findGaps, validateSeries } from '../bars';
import type { Series } from '../indicators/index';
import { computeStats } from './metrics';
import {
  DEFAULT_CONFIG,
  type BacktestConfig,
  type BacktestResult,
  type BarContext,
  type EquityPoint,
  type OrderRequest,
  type Position,
  type Side,
  type Strategy,
  type Trade,
} from './types';

interface PendingOrder {
  kind: 'entry' | 'exit';
  side: Side;
  type: 'market' | 'limit' | 'stop';
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  trailingStop?: number;
  qty?: number;
}

const bps = (n: number) => n / 10_000;

/**
 * Run a strategy over closed bars.
 *
 * The loop is deliberately explicit rather than clever: each iteration is
 * (1) fill yesterday's requests at today's open, (2) walk today's range for
 * protective orders, (3) hand the *closed* bar to the strategy, (4) mark equity.
 * That ordering is what guarantees a signal can never fill on the bar that
 * produced it.
 */
export function runBacktest(
  strategy: Strategy,
  inputCandles: readonly Candle[],
  timeframe: Timeframe,
  configOverride: Partial<BacktestConfig> = {},
): BacktestResult {
  const config: BacktestConfig = { ...DEFAULT_CONFIG, ...configOverride };
  const started = Date.now();
  const warnings: string[] = [];
  const candles = [...inputCandles].sort((a, b) => a.time - b.time);

  if (candles.length < 10) {
    throw new Error(`backtest needs at least 10 bars, received ${candles.length}`);
  }
  const validity = validateSeries(candles);
  if (!validity.ok) warnings.push(`data quality: ${validity.errors.slice(0, 3).join('; ')}`);

  const gaps = findGaps(candles, timeframe);
  if (gaps.length > 0) {
    const missing = gaps.reduce((a, g) => a + g.missing, 0);
    warnings.push(
      `${gaps.length} gap(s) totalling ${missing} missing bars — positions are marked through gaps`,
    );
  }

  const series = strategy.prepare ? strategy.prepare(candles) : {};

  /**
   * All mutable run state lives in one object. Keeping it here (rather than in
   * loose `let`s written from closures) keeps the type narrowing honest and
   * makes "did this bar close the position?" impossible to misread.
   */
  const st = {
    realizedEquity: config.initialCapital,
    position: null as Position | null,
    barredBars: 0,
    peakEquity: config.initialCapital,
  };

  let pending: PendingOrder[] = [];
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];

  const firstClose = candles[0]!.close;

  const slippage = (price: number, side: Side, isEntry: boolean): number => {
    // Always adverse to the trader.
    const sign = side * (isEntry ? 1 : -1);
    return price * (1 + sign * bps(config.slippageBps));
  };

  const feeFor = (notional: number) => Math.abs(notional) * bps(config.feeBps);

  const unrealized = (price: number): number =>
    st.position ? st.position.side * st.position.qty * (price - st.position.entryPrice) : 0;

  const equityNow = (price?: number): number =>
    st.realizedEquity + (st.position && price !== undefined ? unrealized(price) : 0);

  const computeQty = (price: number, stopLoss?: number): number => {
    const eq = equityNow();
    const sizing = config.sizing;
    let raw: number;
    switch (sizing.type) {
      case 'fixed_qty':
        raw = sizing.qty;
        break;
      case 'fixed_notional':
        raw = sizing.notional / price;
        break;
      case 'risk_percent': {
        const riskAmount = (eq * sizing.percent) / 100;
        const distance = stopLoss !== undefined ? Math.abs(price - stopLoss) : 0;
        raw = distance > 0 ? riskAmount / distance : (eq * 0.95) / price;
        break;
      }
      case 'percent_equity': {
        const pct = sizing.percent;
        raw = (eq * pct) / 100 / price;
        break;
      }
    }
    const maxNotional = eq * config.leverage;
    const maxQty = price > 0 ? maxNotional / price : 0;
    return Math.max(0, Math.min(raw, maxQty));
  };

  const closePosition = (fillPrice: number, index: number, reason: Trade['exitReason']) => {
    const p = st.position;
    if (!p) return;
    const exitFill = slippage(fillPrice, p.side, false);
    const gross = p.side * p.qty * (exitFill - p.entryPrice);
    const exitFee = feeFor(p.qty * exitFill);
    const netPnl = gross - exitFee - p.entryFee;
    st.realizedEquity += gross - exitFee;

    const equityAtEntry = equity[p.entryIndex]?.equity ?? config.initialCapital;
    trades.push({
      side: p.side,
      qty: p.qty,
      entryTime: p.entryTime,
      exitTime: candles[index]!.time,
      entryPrice: p.entryPrice,
      exitPrice: exitFill,
      pnl: netPnl,
      pnlPct: equityAtEntry > 0 ? (netPnl / equityAtEntry) * 100 : 0,
      fees: p.entryFee + exitFee,
      barsHeld: index - p.entryIndex,
      exitReason: reason,
      mfe: p.mfe,
      mae: p.mae,
    });
    st.position = null;
  };

  const openPosition = (side: Side, rawPrice: number, index: number, order: PendingOrder) => {
    if (!config.allowShort && side === -1) return;
    const fill = slippage(rawPrice, side, true);
    const qty = order.qty ?? computeQty(fill, order.stopLoss);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const notional = qty * fill;
    if (notional > equityNow() * config.leverage + 1e-9) return;
    const entryFee = feeFor(notional);
    st.realizedEquity -= entryFee;
    st.position = {
      side,
      qty,
      entryPrice: fill,
      entryTime: candles[index]!.time,
      entryIndex: index,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      trailingStop: order.trailingStop,
      // A trailing level derived from a bar's own extreme is necessarily touched
      // by that bar's range, so it only arms from the *next* bar onwards.
      trailingArmedAtBar: order.trailingStop !== undefined ? index : -1,
      mfe: 0,
      mae: 0,
      trailingPeak: fill,
      trailingTrough: fill,
      entryFee,
    };
  };

  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i]!;

    // ---- 1. Fill requests queued on the previous bar, at this bar's open ----
    if (pending.length > 0) {
      for (const order of pending) {
        if (order.kind === 'exit') {
          if (st.position) closePosition(bar.open, i, 'signal');
          continue;
        }
        if (st.position) continue; // one position at a time

        const isMarket = order.type === 'market' || order.price === undefined;
        if (isMarket) {
          openPosition(order.side, bar.open, i, order);
          continue;
        }
        // Resting entry: limit must be touched, stop must be broken.
        const price = order.price!;
        if (order.type === 'limit') {
          const touched = order.side === 1 ? bar.low <= price : bar.high >= price;
          if (touched) openPosition(order.side, price, i, order);
        } else {
          const broken = order.side === 1 ? bar.high >= price : bar.low <= price;
          if (broken) {
            const fillAt = order.side === 1 ? Math.max(price, bar.open) : Math.min(price, bar.open);
            openPosition(order.side, fillAt, i, order);
          }
        }
      }
      pending = [];
    }

    // ---- 2. Walk this bar's range for protective exits ----
    const p = st.position;
    if (p) {
      const long = p.side === 1;

      p.mfe = Math.max(p.mfe, long ? bar.high - p.entryPrice : p.entryPrice - bar.low);
      p.mae = Math.max(p.mae, long ? p.entryPrice - bar.low : bar.high - p.entryPrice);
      p.trailingPeak = Math.max(p.trailingPeak, bar.high);
      p.trailingTrough = Math.min(p.trailingTrough, bar.low);

      // Ratchet only, never loosen — and only once the stop is actually live.
      if (p.trailingStop !== undefined && i > p.trailingArmedAtBar) {
        const level = long ? p.trailingPeak - p.trailingStop : p.trailingTrough + p.trailingStop;
        p.stopLoss =
          p.stopLoss === undefined
            ? level
            : long
              ? Math.max(p.stopLoss, level)
              : Math.min(p.stopLoss, level);
      }

      const stop = p.stopLoss;
      const target = p.takeProfit;
      // A gap fill is only possible on a bar *after* entry: on the entry bar the
      // open is the entry price itself.
      const canGap = i > p.entryIndex;

      const stopGap = canGap && stop !== undefined && (long ? bar.open <= stop : bar.open >= stop);
      const targetGap =
        canGap && target !== undefined && (long ? bar.open >= target : bar.open <= target);
      const stopHit =
        stop !== undefined && (long ? bar.low <= stop : bar.high >= stop);
      const targetHit =
        target !== undefined && (long ? bar.high >= target : bar.low <= target);

      if (stopGap) {
        closePosition(bar.open, i, 'stop');
      } else if (targetGap) {
        closePosition(bar.open, i, 'target');
      } else if (stopHit && targetHit) {
        // Both levels sit inside one bar's range and we cannot know the order, so
        // the configured (pessimistic by default) assumption decides.
        if (config.intrabarPriority === 'stop-first') closePosition(stop!, i, 'stop');
        else closePosition(target!, i, 'target');
      } else if (stopHit) {
        closePosition(stop!, i, 'stop');
      } else if (targetHit) {
        closePosition(target!, i, 'target');
      }
    }

    // ---- 3. Let the strategy act on the *closed* bar ----
    const snapshot = st.position;
    const ctx: BarContext = {
      index: i,
      candle: bar,
      bars: candles,
      position: snapshot ? Object.freeze({ ...snapshot }) : null,
      equity: equityNow(bar.close),
      series,
      value(key: string): number | null {
        const s: Series | undefined = series[key];
        const v = s?.[i];
        return v === undefined ? null : v;
      },
      buy(order: OrderRequest = {}) {
        pending.push({
          kind: 'entry',
          side: 1,
          type: order.type ?? 'market',
          price: order.price,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          trailingStop: order.trailingStop,
          qty: order.qty,
        });
      },
      sell(order: OrderRequest = {}) {
        pending.push({
          kind: 'entry',
          side: -1,
          type: order.type ?? 'market',
          price: order.price,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          trailingStop: order.trailingStop,
          qty: order.qty,
        });
      },
      close() {
        pending.push({ kind: 'exit', side: st.position?.side ?? 1, type: 'market' });
      },
      setStops(levels) {
        const live = st.position;
        if (!live) return;
        if (levels.stopLoss !== undefined) live.stopLoss = levels.stopLoss;
        if (levels.takeProfit !== undefined) live.takeProfit = levels.takeProfit;
        if (levels.trailingStop !== undefined) {
          live.trailingStop = levels.trailingStop;
          live.trailingArmedAtBar = i;
        }
      },
    };

    strategy.onBar(ctx);

    // ---- 4. Mark to market on the close ----
    const eq = equityNow(bar.close);
    if (st.position) st.barredBars++;
    st.peakEquity = Math.max(st.peakEquity, eq);
    const drawdownPct = st.peakEquity > 0 ? (eq / st.peakEquity - 1) * 100 : 0;
    equity.push({
      time: bar.time,
      equity: eq,
      benchmark: config.initialCapital * (bar.close / firstClose),
      drawdownPct,
    });

    if (eq <= 0) {
      warnings.push(
        `account equity reached zero at bar ${i} (${new Date(bar.time * 1000).toISOString()})`,
      );
      if (st.position) closePosition(bar.close, i, 'liquidation');
      break;
    }
  }

  // Liquidate whatever is still open at the last close so stats are complete.
  if (st.position) closePosition(candles.at(-1)!.close, candles.length - 1, 'end');

  if (trades.length === 0) {
    warnings.push('the strategy never opened a trade — check entry conditions and sizing');
  }
  if (candles.length < 100) {
    warnings.push('fewer than 100 bars: statistics are not meaningful');
  }

  const finalEquity = equity.at(-1)?.equity ?? config.initialCapital;
  const benchmarkReturnPct = (candles.at(-1)!.close / firstClose - 1) * 100;

  const stats = computeStats(
    equity,
    trades,
    config.initialCapital,
    timeframe,
    config.riskFreeRate,
    benchmarkReturnPct,
    (st.barredBars / candles.length) * 100,
  );
  // Guarantee the reported final equity matches the curve we return.
  stats.finalEquity = finalEquity;

  return {
    strategy: strategy.name,
    timeframe,
    config,
    equity,
    trades,
    stats,
    warnings,
    runtimeMs: Date.now() - started,
  };
}
