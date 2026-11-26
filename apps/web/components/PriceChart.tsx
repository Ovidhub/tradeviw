'use client';

import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, CandleSeries, Trade } from '@tradeviw/core';

interface Props {
  series: CandleSeries | null;
  trades?: Trade[];
  /** Overlay a simple moving average to show the indicator path works. */
  smaPeriod?: number;
}

/**
 * Chart rendering, isolated behind a single component.
 *
 * This is deliberately the *only* place that imports the charting library, which
 * is the `ChartAdapter` boundary from the roadmap in practice: when the custom
 * renderer lands (multi-pane, volume profile), only this file changes.
 */
export function PriceChart({ series, trades = [], smaPeriod = 50 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const smaRef = useRef<ISeriesApi<'Line'> | null>(null);
  /** v5 moved markers into a plugin attached to a series. */
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // Create once; resize with the viewport.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#8b97a8',
        fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
        fontSize: 11,
        attributionLogo: true, // required by the Apache-2.0 licence
      },
      grid: {
        vertLines: { color: 'rgba(35, 42, 54, 0.55)' },
        horzLines: { color: 'rgba(35, 42, 54, 0.55)' },
      },
      rightPriceScale: { borderColor: '#232a36', scaleMargins: { top: 0.08, bottom: 0.26 } },
      timeScale: { borderColor: '#232a36', timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: {
        mode: 1,
        vertLine: { color: '#3a4353', width: 1, style: 2, labelBackgroundColor: '#232a36' },
        horzLine: { color: '#3a4353', width: 1, style: 2, labelBackgroundColor: '#232a36' },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
      autoSize: true,
    });

    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceLineVisible: true,
      priceLineStyle: 2,
    });

    volumeRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      color: 'rgba(139, 151, 168, 0.35)',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    smaRef.current = chart.addSeries(LineSeries, {
      color: '#4c8dff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    markersRef.current = createSeriesMarkers(candleRef.current, []);

    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      smaRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Push data whenever the series, overlay, or trade set changes.
  useEffect(() => {
    const candles = series?.candles;
    if (!candles || candles.length === 0) return;
    if (!candleRef.current || !volumeRef.current || !smaRef.current || !chartRef.current) return;

    candleRef.current.setData(
      candles.map((c: Candle) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    volumeRef.current.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(38, 166, 154, 0.32)' : 'rgba(239, 83, 80, 0.32)',
      })),
    );

    // Finalised SMA, computed here so the chart stays self-contained.
    const closes = candles.map((c) => c.close);
    const smaData: { time: UTCTimestamp; value: number }[] = [];
    let sum = 0;
    for (let i = 0; i < closes.length; i++) {
      sum += closes[i]!;
      if (i >= smaPeriod) sum -= closes[i - smaPeriod]!;
      if (i >= smaPeriod - 1) {
        smaData.push({ time: candles[i]!.time as UTCTimestamp, value: sum / smaPeriod });
      }
    }
    smaRef.current.setData(smaData);

    chartRef.current.timeScale().fitContent();
  }, [series, smaPeriod]);

  // Entry / exit markers, so a backtest is readable on the chart itself.
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;
    markers.setMarkers(
      trades.slice(0, 400).flatMap((t): SeriesMarker<Time>[] => [
        {
          time: t.entryTime as UTCTimestamp,
          position: t.side === 1 ? ('belowBar' as const) : ('aboveBar' as const),
          color: t.side === 1 ? '#26a69a' : '#ef5350',
          shape: t.side === 1 ? ('arrowUp' as const) : ('arrowDown' as const),
          text: t.side === 1 ? 'BUY' : 'SELL',
          size: 1,
        },
        {
          time: t.exitTime as UTCTimestamp,
          position: t.side === 1 ? ('aboveBar' as const) : ('belowBar' as const),
          color: t.pnl >= 0 ? '#2dd4a7' : '#f5a623',
          shape: 'circle' as const,
          text: `${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(0)}`,
          size: 1,
        },
      ]),
    );
  }, [trades]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      role="img"
      aria-label={
        series
          ? `Candlestick chart of ${series.symbol.name} on the ${series.timeframe} timeframe`
          : 'Loading chart'
      }
    />
  );
}
