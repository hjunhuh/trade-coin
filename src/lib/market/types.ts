export const SYMBOLS = ['BTC', 'ETH'] as const
export type Sym = (typeof SYMBOLS)[number]

export const isSym = (v: unknown): v is Sym => SYMBOLS.includes(v as Sym)

export const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const
export type Interval = (typeof INTERVALS)[number]

export const INTERVAL_SEC: Record<Interval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
}

/** A candle. `t` is its open time in UTC seconds. */
export interface Bar {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** Rolling 24-hour statistics. */
export interface Stats24h {
  last: number
  open: number
  high: number
  low: number
  /** Base-asset volume (BTC or ETH) */
  volume: number
}

/** One trade on the exchange. `time` is in ms. */
export interface Tick {
  sym: Sym
  price: number
  qty: number
  time: number
}

export type FeedStatus = 'connecting' | 'live' | 'reconnecting'

/** Where live prices come from. Each exchange's quirks stay inside its implementation. */
export interface MarketSource {
  id: 'binance' | 'coinbase'
  /** Candles that overlap [start, end] (seconds), oldest first. `end` defaults to now. */
  klines(sym: Sym, interval: Interval, opts: { start?: number; end?: number; limit: number }): Promise<Bar[]>
  stats(sym: Sym): Promise<Stats24h>
  /**
   * Streams trades and 24h statistics for every symbol. Returns a stop function. `onStatus`
   * reports when the socket opens and drops; the source reconnects on its own.
   */
  stream(handlers: {
    onTick: (tick: Tick) => void
    onStats: (sym: Sym, stats: Stats24h) => void
    onStatus: (status: FeedStatus) => void
  }): () => void
}

/** Floors a time in seconds to the open of its candle. */
export const candleOpen = (sec: number, interval: Interval) => {
  const size = INTERVAL_SEC[interval]
  return Math.floor(sec / size) * size
}
