/**
 * The contract for the whole system.
 * Every provider adapter emits these shapes; nothing downstream knows the source.
 */

/** Supported asset classes. Drives which providers are valid. */
export type AssetClass = 'crypto' | 'equity' | 'forex' | 'index' | 'commodity';

/** Canonical timeframe codes. `1M` = one month (capital M), `1m` = one minute. */
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D' | '1W' | '1M';

export const TIMEFRAMES: readonly Timeframe[] = [
  '1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M',
] as const;

/** Milliseconds per timeframe — fixed for intraday, nominal for D/W/M. */
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1D': 24 * 60 * 60_000,
  '1W': 7 * 24 * 60 * 60_000,
  '1M': 30 * 24 * 60 * 60_000,
};

/**
 * A single OHLCV bar.
 * `time` is the bar's OPEN time in **UTC seconds** (matches Lightweight Charts'
 * UTCTimestamp so no conversion is needed at the render boundary).
 */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A venue-tagged instrument. `id` is our canonical key, e.g. `BINANCE:BTCUSDT`. */
export interface SymbolInfo {
  id: string;
  /** Ticker as the venue knows it, e.g. `BTCUSDT`. */
  ticker: string;
  /** Human display name, e.g. `Bitcoin / TetherUS`. */
  name: string;
  assetClass: AssetClass;
  /** Venue code, e.g. `BINANCE`, `NASDAQ`, `FX`. */
  venue: string;
  /** Quote currency, e.g. `USDT`, `USD`. */
  quote: string;
  /** Decimal places appropriate for display. */
  precision: number;
  /** Smallest tradeable increment, if the venue defines one. */
  tickSize?: number;
}

/** A point-in-time quote. `time` is UTC ms; `delayMs` is how stale the venue's feed is. */
export interface Quote {
  symbolId: string;
  price: number;
  time: number;
  /** 0 = real-time. 900000 = 15 minutes delayed. Surfaced in the UI as a data-age badge. */
  delayMs: number;
  source: string;
}

/** Where a dataset came from — always render this next to prices. */
export interface DataProvenance {
  source: string;
  /** Human label, e.g. "Binance public REST (live)" or "Deterministic demo dataset". */
  label: string;
  /** True when the numbers are synthetic. The UI must badge this loudly. */
  synthetic: boolean;
  /** Venue delay in ms; 0 for real-time. */
  delayMs: number;
  fetchedAt: string;
}

/** A candle series plus everything needed to trust it. */
export interface CandleSeries {
  symbol: SymbolInfo;
  timeframe: Timeframe;
  candles: Candle[];
  provenance: DataProvenance;
}

/** A request for history. All providers must satisfy this shape. */
export interface HistoryRequest {
  symbolId: string;
  timeframe: Timeframe;
  /** Inclusive UTC seconds. */
  from: number;
  /** Inclusive UTC seconds. */
  to: number;
  /** Hard cap the adapter should honour (default 1000). */
  limit?: number;
}

/**
 * The only interface a data provider must implement.
 * Adding a venue = adding one file. Nothing downstream changes.
 */
export interface DataProvider {
  /** Stable id, e.g. `binance-rest`. */
  readonly id: string;
  readonly assetClasses: readonly AssetClass[];
  /** Whether this provider gives true real-time data for these classes. */
  readonly realtime: boolean;
  /** Venue delay in ms (0 = real-time). */
  readonly delayMs: number;
  supports(symbol: SymbolInfo): boolean;
  history(req: HistoryRequest): Promise<CandleSeries>;
  search?(query: string): Promise<SymbolInfo[]>;
}
