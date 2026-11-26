#!/usr/bin/env node
/**
 * Backtest CLI — the fastest way to prove the engine works end to end.
 *
 *   npm run demo                      # BTCUSDT 4h, 3000 bars, all strategies
 *   npm run demo -- --symbol ETHUSDT --tf 1h --bars 5000
 *   npm run demo -- --offline         # synthetic data, no network
 *   npm run demo -- --json            # machine-readable output
 *
 * Real data comes from Binance's public REST API (no key, no cost). If the
 * network is unavailable it falls back to the deterministic demo dataset and
 * says so loudly — it never silently pretends synthetic data is real.
 */
import {
  BinanceRestProvider,
  fetchPagedHistory,
  formatStats,
  runBacktest,
  strategyLibrary,
  syntheticCandles,
  type CandleSeries,
  type Timeframe,
  TIMEFRAMES,
} from '@tradeviw/core';
import { donchianBreakout, emaCrossAtr, macdTrend, rsiMeanReversion, smaCross, type Strategy } from '@tradeviw/core';
import { sweep, walkForward, walkForwardSummary, type SweepOptions } from '@tradeviw/core';

interface Args {
  symbol: string;
  tf: Timeframe;
  bars: number;
  offline: boolean;
  json: boolean;
  capital: number;
  feeBps: number;
  slippageBps: number;
  strategy?: string;
  sweep?: string;
  walkForward?: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const tf = (get('--tf') ?? '4h') as Timeframe;
  if (!TIMEFRAMES.includes(tf)) {
    throw new Error(`unknown timeframe "${tf}". Choose one of: ${TIMEFRAMES.join(', ')}`);
  }
  return {
    symbol: (get('--symbol') ?? 'BTCUSDT').toUpperCase(),
    tf,
    bars: Number(get('--bars') ?? 3000),
    offline: argv.includes('--offline'),
    json: argv.includes('--json'),
    capital: Number(get('--capital') ?? 10_000),
    feeBps: Number(get('--fee') ?? 10),
    slippageBps: Number(get('--slippage') ?? 5),
    strategy: get('--strategy'),
    sweep: get('--sweep'),
    walkForward: get('--walk-forward'),
  };
}

async function loadSeries(args: Args): Promise<CandleSeries> {
  if (!args.offline) {
    try {
      const provider = new BinanceRestProvider();
      const series = await fetchPagedHistory(
        provider,
        `BINANCE:${args.symbol}`,
        args.tf,
        args.bars,
        {
          onProgress: (n) => {
            if (!args.json && process.stdout.isTTY) process.stdout.write(`\r  fetching… ${n} bars`);
          },
        },
      );
      if (!args.json && process.stdout.isTTY) process.stdout.write('\r'.padEnd(30) + '\r');
      return series;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!args.json) {
        console.warn(`\n⚠  live data unavailable (${message})`);
        console.warn('   falling back to the deterministic demo dataset — numbers are NOT real.\n');
      }
    }
  }

  const step = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1D': 86400, '1W': 604800, '1M': 2592000 }[args.tf];
  return {
    symbol: {
      id: `DEMO:${args.symbol}`,
      ticker: args.symbol,
      name: `${args.symbol} (demo)`,
      assetClass: 'crypto',
      venue: 'DEMO',
      quote: 'USD',
      precision: 2,
    },
    timeframe: args.tf,
    candles: syntheticCandles({
      bars: args.bars,
      startTime: Math.floor(Date.now() / 1000) - args.bars * step,
      timeframe: args.tf,
      seed: args.symbol,
    }),
    provenance: {
      source: 'synthetic',
      label: 'Deterministic demo dataset · synthetic',
      synthetic: true,
      delayMs: 0,
      fetchedAt: new Date().toISOString(),
    },
  };
}

/** Map a user-friendly strategy name to a factory function. */
const strategyFactories: Record<string, (p: Record<string, unknown>) => Strategy> = {
  'sma cross': (p) => smaCross(Number(p.fast), Number(p.slow)),
  'ema crossover': (p) =>
    emaCrossAtr(Number(p.fast), Number(p.slow), Number(p.atrPeriod), Number(p.atrMult)),
  'donchian breakout': (p) => donchianBreakout(Number(p.entry), Number(p.exit)),
  'rsi mean reversion': (p) =>
    rsiMeanReversion(Number(p.period), Number(p.oversold), Number(p.overbought), Number(p.atrMult)),
  'macd trend': (p) => macdTrend(Number(p.fast), Number(p.slow), Number(p.signal), Number(p.trailAtr)),
};

/** Parameter grid per strategy — small enough to run in seconds. */
const paramGrids: Record<string, Record<string, unknown[]>> = {
  'sma cross': { fast: [10, 20, 30], slow: [40, 50, 60] },
  'ema crossover': { fast: [12], slow: [26], atrPeriod: [14], atrMult: [1.5, 2, 3] },
  'donchian breakout': { entry: [10, 20], exit: [5, 10] },
  'rsi mean reversion': {
    period: [14],
    oversold: [20, 30],
    overbought: [70, 80],
    atrMult: [1.5, 2],
  },
  'macd trend': { fast: [12], slow: [26], signal: [9], trailAtr: [2, 3] },
};

const sweepConfig: SweepOptions = {
  feeBps: 10,
  slippageBps: 5,
  leverage: 1,
  sizing: { type: 'percent_equity', percent: 95 },
  allowShort: true,
  rankBy: 'calmar',
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const series = await loadSeries(args);
  const { candles, provenance } = series;

  if (!args.json) {
    const from = new Date(candles[0]!.time * 1000).toISOString().slice(0, 10);
    const to = new Date(candles.at(-1)!.time * 1000).toISOString().slice(0, 10);
    const badge = provenance.synthetic ? '⚠ SYNTHETIC' : '● REAL DATA';
    console.log(`\n${badge}  ${series.symbol.ticker} · ${args.tf} · ${candles.length} bars · ${from} → ${to}`);
    console.log(`        source: ${provenance.label}`);
    console.log(
      `        costs:  ${args.feeBps} bps fee/side, ${args.slippageBps} bps slippage/side, capital ${args.capital}\n`,
    );
  }

  // ---- Parameter sweep -------------------------------------------------------
  if (args.sweep) {
    const name = args.sweep.toLowerCase();
    const factory = strategyFactories[name];
    const grid = paramGrids[name];
    if (!factory || !grid) {
      const available = Object.keys(strategyFactories).join(', ');
      throw new Error(`unknown strategy "${args.sweep}". Available: ${available}`);
    }
    const opts = { ...sweepConfig, initialCapital: args.capital };
    const results = sweep(factory, grid, candles, args.tf, opts);

    if (args.json) {
      console.log(
        JSON.stringify(
          {
            mode: 'sweep',
            strategy: args.sweep,
            symbol: series.symbol.id,
            timeframe: args.tf,
            bars: candles.length,
            synthetic: provenance.synthetic,
            combinations: results.length,
            top: results.slice(0, 10).map((r) => ({
              params: r.params,
              stats: r.result.stats,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`\n── Parameter sweep: ${args.sweep} ──\n`);
    console.log(`grid size: ${Object.values(grid).reduce((a, b) => a * b.length, 1)} combinations`);
    console.log(`ranked by: ${sweepConfig.rankBy}\n`);
    for (const r of results.slice(0, 10)) {
      console.log(
        `  ${JSON.stringify(r.params)} → return ${r.result.stats.totalReturnPct.toFixed(2)}%  ` +
          `DD ${r.result.stats.maxDrawdownPct.toFixed(2)}%  ` +
          `calmar ${r.result.stats.calmar.toFixed(2)}  trades ${r.result.stats.totalTrades}`,
      );
    }
    const best = results[0]!;
    console.log(
      `\n  Best: ${JSON.stringify(best.params)} — return ${best.result.stats.totalReturnPct.toFixed(2)}%`,
    );
    return;
  }

  // ---- Walk-forward ----------------------------------------------------------
  if (args.walkForward) {
    const name = args.walkForward.toLowerCase();
    const factory = strategyFactories[name];
    const grid = paramGrids[name];
    if (!factory || !grid) {
      const available = Object.keys(strategyFactories).join(', ');
      throw new Error(`unknown strategy "${args.walkForward}". Available: ${available}`);
    }
    const opts = {
      ...sweepConfig,
      initialCapital: args.capital,
      trainBars: Math.floor(candles.length * 0.6),
      testBars: Math.floor(candles.length * 0.2),
      stepBars: Math.floor(candles.length * 0.2),
    } as SweepOptions & { trainBars: number; testBars: number; stepBars: number };

    const wf = walkForward(factory, grid, candles, args.tf, opts);

    if (args.json) {
      console.log(
        JSON.stringify(
          {
            mode: 'walk-forward',
            strategy: args.walkForward,
            symbol: series.symbol.id,
            timeframe: args.tf,
            bars: candles.length,
            synthetic: provenance.synthetic,
            ...wf,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`\n── Walk-forward: ${args.walkForward} ──\n`);
    console.log(walkForwardSummary(wf));
    console.log('');
    for (const step of wf.steps) {
      console.log(
        `  window ${step.window + 1}: train bars ${step.trainRange.start}-${step.trainRange.end} → ` +
          `test ${step.testRange.start}-${step.testRange.end}\n` +
          `    best params: ${JSON.stringify(step.bestParams)}\n` +
          `    in-sample return : ${step.inSample.result.stats.totalReturnPct.toFixed(2)}%\n` +
          `    out-of-sample return: ${step.outOfSample.stats.totalReturnPct.toFixed(2)}%  ` +
          `(buy & hold ${step.outOfSample.stats.benchmarkReturnPct.toFixed(2)}%)\n`,
      );
    }
    return;
  }

  const all = strategyLibrary();
  const selected = args.strategy
    ? all.filter((s) => s.name.toLowerCase().includes(args.strategy!.toLowerCase()))
    : all;
  if (selected.length === 0) {
    throw new Error(`no strategy matched "${args.strategy}". Available: ${all.map((s) => s.name).join(' | ')}`);
  }

  const results = selected.map((strategy) =>
    runBacktest(strategy, candles, args.tf, {
      initialCapital: args.capital,
      feeBps: args.feeBps,
      slippageBps: args.slippageBps,
      allowShort: true,
    }),
  );

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          symbol: series.symbol.id,
          timeframe: args.tf,
          bars: candles.length,
          synthetic: provenance.synthetic,
          results: results.map((r) => ({ strategy: r.strategy, stats: r.stats, warnings: r.warnings })),
        },
        null,
        2,
      ),
    );
    return;
  }

  // Rank by return but show enough context that a high return with a brutal
  // drawdown cannot masquerade as a good strategy.
  const ranked = [...results].sort((a, b) => b.stats.totalReturnPct - a.stats.totalReturnPct);
  console.log('── Results (ranked by total return) ──\n');
  for (const r of ranked) console.log(formatStats(r) + '\n');

  const warnings = new Set(results.flatMap((r) => r.warnings));
  if (warnings.size > 0) {
    console.log('── Data / run warnings ──');
    for (const w of warnings) console.log(`  • ${w}`);
    console.log('');
  }

  const best = ranked[0]!;
  const bh = results.find((r) => r.strategy.startsWith('Buy & hold'));
  if (bh) {
    const verdict = best.stats.totalReturnPct > bh.stats.benchmarkReturnPct;
    console.log(
      verdict
        ? `✔ ${best.strategy} beat buy & hold (${best.stats.totalReturnPct.toFixed(2)}% vs ${bh.stats.benchmarkReturnPct.toFixed(2)}%) — past performance is not predictive.`
        : `✘ nothing beat buy & hold (${bh.stats.benchmarkReturnPct.toFixed(2)}%). That is the normal result, and the point of having the benchmark.`,
    );
  }
  const slowest = Math.max(...results.map((r) => r.runtimeMs));
  console.log(`  ${results.length} strategies on ${candles.length} bars in ${slowest} ms max.\n`);
}

main().catch((err) => {
  console.error(`\nerror: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
