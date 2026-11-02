// Coinbase Exchange's public market data, used when Binance's can't be reached. Its candles come
// in fewer sizes, so 4-hour candles are built from hourly ones.

import { collect, getJson } from './paging'
import { keepConnected } from './socket'
import { INTERVAL_SEC, SYMBOLS, type Bar, type Interval, type MarketSource, type Sym } from './types'

const REST = 'https://api.exchange.coinbase.com'
const WS = 'wss://ws-feed.exchange.coinbase.com'

const PRODUCT: Record<Sym, string> = { BTC: 'BTC-USD', ETH: 'ETH-USD' }
const FROM_PRODUCT: Record<string, Sym> = { 'BTC-USD': 'BTC', 'ETH-USD': 'ETH' }

/** Coinbase serves at most this many candles per request */
const PER_PAGE = 300

/** [time, low, high, open, close, volume], newest first */
type RawCandle = [number, number, number, number, number, number]

/** The candle size to fetch for each interval, and how many of them make one */
const FETCH: Record<Interval, { granularity: number; group: number }> = {
  '1m': { granularity: 60, group: 1 },
  '5m': { granularity: 300, group: 1 },
  '15m': { granularity: 900, group: 1 },
  '1h': { granularity: 3600, group: 1 },
  '4h': { granularity: 3600, group: 4 },
  '1d': { granularity: 86400, group: 1 },
}

const iso = (sec: number) => new Date(sec * 1000).toISOString()

/** Merges small candles into `size`-second candles aligned to UTC. */
function regroup(bars: Bar[], size: number): Bar[] {
  const out: Bar[] = []
  for (const b of bars) {
    const t = Math.floor(b.t / size) * size
    const cur = out.at(-1)
    if (cur && cur.t === t) {
      cur.h = Math.max(cur.h, b.h)
      cur.l = Math.min(cur.l, b.l)
      cur.c = b.c
      cur.v += b.v
    } else {
      out.push({ ...b, t })
    }
  }
  return out
}

export const coinbase: MarketSource = {
  id: 'coinbase',

  async klines(sym, interval, opts) {
    const { granularity, group } = FETCH[interval]
    const bars = await collect(
      async (start, end, n) => {
        const from = start ?? end - (n - 1) * granularity
        const to = Math.min(end, from + (n - 1) * granularity)
        const q = new URLSearchParams({ granularity: String(granularity), start: iso(from), end: iso(to) })
        const rows = await getJson<RawCandle[]>(`${REST}/products/${PRODUCT[sym]}/candles?${q}`)
        return rows
          .map(([t, l, h, o, c, v]) => ({ t, o, h, l, c, v }))
          .sort((a, b) => a.t - b.t)
      },
      PER_PAGE,
      granularity,
      { ...opts, limit: opts.limit * group },
    )
    if (group === 1) return bars
    const grouped = regroup(bars, INTERVAL_SEC[interval])
    return opts.start != null ? grouped.slice(0, opts.limit) : grouped.slice(-opts.limit)
  },

  async stats(sym) {
    const s = await getJson<Record<string, string>>(`${REST}/products/${PRODUCT[sym]}/stats`)
    return { last: Number(s.last), open: Number(s.open), high: Number(s.high), low: Number(s.low), volume: Number(s.volume) }
  },

  stream({ onTick, onStats, onStatus }) {
    return keepConnected({
      url: WS,
      onStatus,
      onOpen: (ws) =>
        ws.send(JSON.stringify({ type: 'subscribe', product_ids: SYMBOLS.map((s) => PRODUCT[s]), channels: ['ticker', 'heartbeat'] })),
      onMessage: (msg) => {
        const m = msg as Record<string, string>
        if (m.type !== 'ticker') return
        const sym = FROM_PRODUCT[m.product_id]
        if (!sym) return
        const price = Number(m.price)
        onTick({ sym, price, qty: Number(m.last_size ?? 0), time: m.time ? Date.parse(m.time) : Date.now() })
        onStats(sym, {
          last: price,
          open: Number(m.open_24h),
          high: Number(m.high_24h),
          low: Number(m.low_24h),
          volume: Number(m.volume_24h),
        })
      },
    })
  },
}
