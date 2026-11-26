'use client';

import { useEffect, useRef } from 'react';
import {
  AreaSeries,
  BaselineSeries,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { EquityPoint } from '@tradeviw/core';

/**
 * Equity curve with the buy & hold benchmark and an underwater (drawdown) plot.
 * A return number without the drawdown underneath it is marketing, not analysis.
 */
export function EquityChart({ equity }: { equity: EquityPoint[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const stratRef = useRef<ISeriesApi<'Area'> | null>(null);
  const benchRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ddRef = useRef<ISeriesApi<'Baseline'> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#8b97a8',
        fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
        fontSize: 10,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: 'rgba(35,42,54,0.5)' },
        horzLines: { color: 'rgba(35,42,54,0.5)' },
      },
      rightPriceScale: { borderColor: '#232a36', scaleMargins: { top: 0.1, bottom: 0.32 } },
      timeScale: { borderColor: '#232a36', timeVisible: false },
      crosshair: {
        vertLine: { color: '#3a4353', style: 2, labelBackgroundColor: '#232a36' },
        horzLine: { color: '#3a4353', style: 2, labelBackgroundColor: '#232a36' },
      },
      autoSize: true,
    });

    stratRef.current = chart.addSeries(AreaSeries, {
      lineColor: '#2dd4a7',
      topColor: 'rgba(45, 212, 167, 0.24)',
      bottomColor: 'rgba(45, 212, 167, 0.01)',
      lineWidth: 2,
      priceLineVisible: false,
    });
    benchRef.current = chart.addSeries(LineSeries, {
      color: '#8b97a8',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ddRef.current = chart.addSeries(BaselineSeries, {
      baseValue: { type: 'price', price: 0 },
      topLineColor: 'rgba(239, 83, 80, 0.7)',
      topFillColor1: 'rgba(239, 83, 80, 0.22)',
      topFillColor2: 'rgba(239, 83, 80, 0.04)',
      bottomLineColor: 'rgba(239, 83, 80, 0.7)',
      bottomFillColor1: 'rgba(239, 83, 80, 0.04)',
      bottomFillColor2: 'rgba(239, 83, 80, 0.22)',
      priceScaleId: 'dd',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale('dd').applyOptions({ scaleMargins: { top: 0.76, bottom: 0 } });

    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!stratRef.current || !benchRef.current || !ddRef.current) return;
    if (equity.length === 0) return;

    stratRef.current.setData(equity.map((p) => ({ time: p.time as UTCTimestamp, value: p.equity })));
    benchRef.current.setData(equity.map((p) => ({ time: p.time as UTCTimestamp, value: p.benchmark })));
    ddRef.current.setData(
      equity.map((p) => ({ time: p.time as UTCTimestamp, value: p.drawdownPct })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [equity]);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" role="img" aria-label="Equity curve versus buy and hold, with drawdown" />
      <div className="pointer-events-none absolute top-2 left-2 flex gap-3 text-[10px]">
        <span className="flex items-center gap-1 text-[var(--color-accent)]">
          <span className="h-0.5 w-4 bg-[var(--color-accent)]" /> strategy
        </span>
        <span className="flex items-center gap-1 text-[var(--color-muted)]">
          <span className="h-0.5 w-4 bg-[var(--color-muted)]" /> buy &amp; hold
        </span>
        <span className="flex items-center gap-1 text-[var(--color-down)]">
          <span className="h-2 w-2 bg-[var(--color-down)]/40" /> drawdown
        </span>
      </div>
    </div>
  );
}
