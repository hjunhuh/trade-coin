// Binance's public market data endpoints (no account, no key). These hosts serve market data
// only, which is all a simulator needs.

import { collect, getJson } from './paging'
import { keepConnected } from './socket'
import { INTERVAL_SEC, SYMBOLS, type Bar, type MarketSource, type Stats24h, type Sym } from './types'

const REST = 'https://data-api.binance.vision/api/v3'
const WS = 'wss://data-stream.binance.vision/stream'

const PAIR: Record<Sym, string> = { BTC: 'BTCUSDT', ETH: 'ETHUSDT' }
const FROM_PAIR: Record<string, Sym> = { BTCUSDT: 'BTC', ETHUSDT: 'ETH' }

/** [openTime, open, high, low, close, volume, closeTime, ...] with prices as strings */
type RawKline = [number, string, string, string, string, string, ...unknown[]]

interface RawStats {
  lastPrice: string
  openPrice: string
  highPrice: string
  lowPrice: string
  volume: string
}

const toBar = (k: RawKline): Bar => ({
  t: Math.floor(k[0] / 1000),
  o: Number(k[1]),
  h: Number(k[2]),
  l: Number(k[3]),
  c: Number(k[4]),
  v: Number(k[5]),
})

export const binance: MarketSource = {
  id: 'binance',

  klines(sym, interval, opts) {
    return collect(
      async (start, end, n) => {
        const q = new URLSearchParams({ symbol: PAIR[sym], interval, limit: String(n), endTime: String(end * 1000 + 999) })
        if (start != null) q.set('startTime', String(start * 1000))
        const rows = await getJson<RawKline[]>(`${REST}/klines?${q}`)
        return rows.map(toBar)
      },
      1000,
      INTERVAL_SEC[interval],
      opts,
    )
  },

  async stats(sym) {
    const s = await getJson<RawStats>(`${REST}/ticker/24hr?symbol=${PAIR[sym]}`)
    return {
      last: Number(s.lastPrice),
      open: Number(s.openPrice),
      high: Number(s.highPrice),
      low: Number(s.lowPrice),
      volume: Number(s.volume),
    }
  },

  stream({ onTick, onStats, onStatus }) {
    const streams = SYMBOLS.flatMap((s) => {
      const p = PAIR[s].toLowerCase()
      return [`${p}@aggTrade`, `${p}@ticker`]
    })
    return keepConnected({
      url: `${WS}?streams=${streams.join('/')}`,
      onStatus,
      onMessage: (msg) => {
        const data = (msg as { data?: Record<string, unknown> }).data
        if (!data) return
        const sym = FROM_PAIR[data.s as string]
        if (!sym) return
        if (data.e === 'aggTrade') {
          onTick({ sym, price: Number(data.p), qty: Number(data.q), time: Number(data.T) })
        } else if (data.e === '24hrTicker') {
          const stats: Stats24h = {
            last: Number(data.c),
            open: Number(data.o),
            high: Number(data.h),
            low: Number(data.l),
            volume: Number(data.v),
          }
          onStats(sym, stats)
        }
      },
    })
  },
}
