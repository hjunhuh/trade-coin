// The one live connection to the market. It picks a data source, keeps its socket open, and
// hands out what happened in small windows instead of every single trade, so screens and the
// trading engine don't redo their work dozens of times a second.

import { create } from 'zustand'
import { AppError } from '../errors'
import { binance } from './binance'
import { coinbase } from './coinbase'
import { SYMBOLS, type FeedStatus, type MarketSource, type Stats24h, type Sym, type Tick } from './types'

/** Every trade of one symbol between two flushes. Never crosses a minute boundary. */
export interface PriceWindow {
  sym: Sym
  open: number
  high: number
  low: number
  last: number
  volume: number
  /** ms of the first and last trade */
  from: number
  to: number
}

type Listener = (w: PriceWindow) => void

interface MarketState {
  status: FeedStatus | 'error'
  source: MarketSource['id'] | null
  /** Bumped when the source changes, so charts reload their history from the new one */
  generation: number
  price: Record<Sym, number | null>
  stats: Record<Sym, Stats24h | null>
  /** ms of the last trade seen */
  lastTickAt: number
}

export const useMarket = create<MarketState>()(() => ({
  status: 'connecting',
  source: null,
  generation: 0,
  price: { BTC: null, ETH: null },
  stats: { BTC: null, ETH: null },
  lastTickAt: 0,
}))

const SOURCES: MarketSource[] = [binance, coinbase]
const FLUSH_MS = 250
/** A source whose socket hasn't delivered anything by then is swapped for the next one */
const LIVE_DEADLINE_MS = 12000
const PROBE_TIMEOUT_MS = 6000

let source: MarketSource | null = null
let sourcePromise: Promise<MarketSource> | null = null
let stopStream: (() => void) | null = null
let deadline: ReturnType<typeof setTimeout> | undefined
let flushTimer: ReturnType<typeof setInterval> | undefined
let users = 0
const listeners = new Set<Listener>()
const pending = new Map<Sym, PriceWindow>()

const minute = (ms: number) => Math.floor(ms / 60000)

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    p.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    )
  })
}

/** The first source, in order of preference, that answers. */
async function probe(skip?: MarketSource): Promise<MarketSource> {
  for (const s of SOURCES) {
    if (s === skip) continue
    try {
      const stats = await withTimeout(s.stats('BTC'), PROBE_TIMEOUT_MS)
      if (Number.isFinite(stats.last) && stats.last > 0) return s
    } catch {
      /* try the next one */
    }
  }
  throw new AppError('unreachable', 'no market data source answered', 0)
}

/** The data source in use, chosen on first call. */
export function marketSource(): Promise<MarketSource> {
  if (source) return Promise.resolve(source)
  if (!sourcePromise) {
    sourcePromise = probe().then(
      (s) => {
        source = s
        useMarket.setState({ source: s.id })
        return s
      },
      (err) => {
        sourcePromise = null
        throw err
      },
    )
  }
  return sourcePromise
}

function emit(w: PriceWindow) {
  for (const l of listeners) {
    try {
      l(w)
    } catch (err) {
      console.error(err)
    }
  }
}

function flush() {
  if (pending.size === 0) return
  const windows = [...pending.values()]
  pending.clear()
  const price = { ...useMarket.getState().price }
  let lastTickAt = useMarket.getState().lastTickAt
  for (const w of windows) {
    price[w.sym] = w.last
    lastTickAt = Math.max(lastTickAt, w.to)
  }
  useMarket.setState({ price, lastTickAt })
  windows.forEach(emit)
}

function onTick(tick: Tick) {
  if (!(tick.price > 0)) return
  const cur = pending.get(tick.sym)
  if (cur && minute(cur.from) !== minute(tick.time)) {
    // Keep each window inside one candle: send the old minute out before starting the next
    pending.delete(tick.sym)
    emit(cur)
  }
  const w = pending.get(tick.sym)
  if (!w) {
    pending.set(tick.sym, {
      sym: tick.sym,
      open: tick.price,
      high: tick.price,
      low: tick.price,
      last: tick.price,
      volume: tick.qty,
      from: tick.time,
      to: tick.time,
    })
  } else {
    w.high = Math.max(w.high, tick.price)
    w.low = Math.min(w.low, tick.price)
    w.last = tick.price
    w.volume += tick.qty
    w.to = Math.max(w.to, tick.time)
  }
}

function onStats(sym: Sym, stats: Stats24h) {
  if (!(stats.last > 0)) return
  const cur = useMarket.getState().stats
  useMarket.setState({ stats: { ...cur, [sym]: stats } })
}

function startStream(s: MarketSource) {
  stopStream?.()
  clearTimeout(deadline)
  stopStream = s.stream({
    onTick,
    onStats,
    onStatus: (status) => {
      useMarket.setState({ status })
      if (status === 'live') clearTimeout(deadline)
    },
  })
  // A socket that never delivers (blocked, or the exchange is down): move on to the next source
  deadline = setTimeout(() => {
    if (useMarket.getState().status === 'live' || users === 0) return
    void probe(s).then(
      (next) => {
        if (users === 0) return
        source = next
        sourcePromise = Promise.resolve(next)
        useMarket.setState((st) => ({ source: next.id, generation: st.generation + 1 }))
        startStream(next)
      },
      () => {
        /* nothing better: keep retrying the current one */
      },
    )
  }, LIVE_DEADLINE_MS)
}

/** Loads the latest 24h numbers once, so the screen has them before the socket's first update. */
async function primeStats(s: MarketSource) {
  await Promise.all(
    SYMBOLS.map(async (sym) => {
      try {
        const stats = await s.stats(sym)
        if (!useMarket.getState().stats[sym]) onStats(sym, stats)
        if (useMarket.getState().price[sym] == null) {
          useMarket.setState((st) => ({ price: { ...st.price, [sym]: stats.last } }))
        }
      } catch {
        /* the socket fills it in */
      }
    }),
  )
}

/**
 * Starts the live feed (shared by everyone who calls it) and returns a release function.
 * The feed stops once nobody uses it.
 */
export function acquireFeed(): () => void {
  users++
  if (users === 1) {
    useMarket.setState({ status: 'connecting' })
    flushTimer = setInterval(flush, FLUSH_MS)
    marketSource().then(
      (s) => {
        if (users === 0) return
        void primeStats(s)
        startStream(s)
      },
      () => useMarket.setState({ status: 'error' }),
    )
  }
  let released = false
  return () => {
    if (released) return
    released = true
    users--
    if (users === 0) {
      stopStream?.()
      stopStream = null
      clearTimeout(deadline)
      clearInterval(flushTimer)
      pending.clear()
    }
  }
}

/** Retries after the feed couldn't find any source. */
export function retryFeed() {
  if (users === 0 || useMarket.getState().status !== 'error') return
  useMarket.setState({ status: 'connecting' })
  marketSource().then(
    (s) => {
      void primeStats(s)
      startStream(s)
      useMarket.setState((st) => ({ generation: st.generation + 1 }))
    },
    () => useMarket.setState({ status: 'error' }),
  )
}

/** Hears every price window from the feed. Returns an unsubscribe function. */
export function onPrices(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
