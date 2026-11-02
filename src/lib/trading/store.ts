// The player's virtual account, kept in the browser. Live prices from the feed are checked
// against open positions as they arrive; prices missed while the page was closed are replayed
// from the exchange's candles the next time it opens, so a position that should have been
// liquidated while away is.

import { create } from 'zustand'
import { AppError } from '../errors'
import { createJSONStorage, persist } from 'zustand/middleware'
import { marketSource, onPrices, useMarket, type PriceWindow } from '../market/feed'
import { INTERVAL_SEC, SYMBOLS, type Bar, type Interval, type Sym } from '../market/types'
import { safeStorage } from '../store'
import {
  checkLiquidation,
  equity,
  newAccount,
  placeOrder,
  sampleEquity,
  settleFunding,
  type Account,
  type Fill,
  type OrderRequest,
} from './engine'

export type TradeEvent =
  | { type: 'liquidation'; fill: Fill; away: boolean }
  | { type: 'funding'; sym: Sym; amount: number }

interface AccountState {
  account: Account
  /** Whether prices missed while the page was closed are still being replayed */
  catchingUp: boolean
}

const STORAGE_KEY = 'trade-coin.account.v1'

export const useAccount = create<AccountState>()(
  persist(
    (): AccountState => ({
      account: newAccount(Date.now()),
      catchingUp: false,
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ account: s.account }),
      version: 1,
    },
  ),
)

const listeners = new Set<(e: TradeEvent) => void>()
export function onTradeEvent(l: (e: TradeEvent) => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
const emit = (e: TradeEvent) => listeners.forEach((l) => l(e))

const prices = () => useMarket.getState().price

function commit(account: Account) {
  useAccount.setState({ account })
}

/** Market order on `sym` at the latest price. Throws an AppError when it can't be filled. */
export function order(sym: Sym, req: OrderRequest): Fill[] {
  // The replay rewrites the account from where it left off; an order now would be lost
  if (useAccount.getState().catchingUp) throw new AppError('catching_up', 'still replaying missed prices', 409)
  const price = prices()[sym]
  const now = Date.now()
  const { account, fills } = placeOrder(useAccount.getState().account, sym, req, price ?? 0, now)
  commit(sampleEquity({ ...account, checkedUntil: Math.max(account.checkedUntil, now) }, now, equity(account, prices()), true))
  return fills
}

/** Starts over with a fresh balance. */
export function resetAccount() {
  commit(newAccount(Date.now()))
}

// --- Live checks -------------------------------------------------------------------------------

/** Windows that arrive while the missed prices are replayed wait here, then run in order */
let queued: PriceWindow[] = []
/** How often `checkedUntil` is saved when nothing else changed */
const CHECKPOINT_MS = 15_000
let lastCheckpoint = 0

function applyWindow(a: Account, w: PriceWindow): Account {
  let next = a
  const funding = settleFunding(next, w.to, (sym) => prices()[sym] ?? null)
  next = funding.account
  for (const p of funding.payments) emit({ type: 'funding', sym: p.sym, amount: p.amount })
  const liq = checkLiquidation(next, w.sym, w.low, w.high, w.to)
  if (liq.fill) {
    next = liq.account
    emit({ type: 'liquidation', fill: liq.fill, away: false })
    next = sampleEquity(next, w.to, equity(next, prices()), true)
  }
  return next
}

function onWindow(w: PriceWindow) {
  if (useAccount.getState().catchingUp) {
    queued.push(w)
    return
  }
  const before = useAccount.getState().account
  let next = applyWindow(before, w)
  const now = Date.now()
  next = sampleEquity(next, now, equity(next, prices()))
  if (next !== before || now - lastCheckpoint > CHECKPOINT_MS) {
    lastCheckpoint = now
    commit({ ...next, checkedUntil: Math.max(next.checkedUntil, w.to) })
  }
}

// --- Catching up on missed prices ----------------------------------------------------------------

/** Most candles one replay looks at per coin; the candle size grows with the gap to stay under it */
const REPLAY_CANDLES = 10_000
const REPLAY_INTERVALS: Interval[] = ['1m', '15m', '1h', '1d']
/** A gap shorter than this is covered by the live checks already */
const MIN_GAP_MS = 30_000

function replayInterval(gapMs: number): Interval {
  return REPLAY_INTERVALS.find((i) => gapMs / 1000 / INTERVAL_SEC[i] <= REPLAY_CANDLES) ?? '1d'
}

/**
 * Replays candles from the last checked time up to now: funding times and liquidation levels
 * reached in between are settled in the order they happened. A candle that started before the
 * last check is skipped, since part of it was checked live already and its extremes may come
 * from before a position existed.
 */
export async function catchUp(): Promise<void> {
  const state = useAccount.getState()
  if (state.catchingUp) return
  const start = state.account.checkedUntil
  const now = Date.now()
  const open = SYMBOLS.filter((s) => state.account.positions[s])
  if (now - start < MIN_GAP_MS || open.length === 0) {
    // Nothing to replay; only funding times passed while away still need settling
    finishCatchUp(state.account, now)
    return
  }

  useAccount.setState({ catchingUp: true })
  try {
    const source = await marketSource()
    const interval = replayInterval(now - start)
    const size = INTERVAL_SEC[interval]
    const fromSec = Math.ceil(start / 1000 / size) * size
    const series = new Map<Sym, Bar[]>()
    await Promise.all(
      open.map(async (sym) => {
        const bars = await source.klines(sym, interval, { start: fromSec, end: Math.floor(now / 1000), limit: REPLAY_CANDLES })
        series.set(sym, bars.filter((b) => b.t * 1000 >= start))
      }),
    )

    /** Price of `sym` at `time`: the open of the first candle at or after it, else the last close */
    const priceAt = (sym: Sym, time: number) => {
      const bars = series.get(sym)
      if (!bars?.length) return prices()[sym] ?? null
      const b = bars.find((x) => x.t * 1000 >= time)
      return b ? b.o : bars.at(-1)!.c
    }

    let a = useAccount.getState().account
    const times = [...new Set([...series.values()].flatMap((bars) => bars.map((b) => b.t)))].sort((x, y) => x - y)
    for (const t of times) {
      const funding = settleFunding(a, t * 1000, priceAt)
      a = funding.account
      for (const sym of open) {
        const bar = series.get(sym)?.find((b) => b.t === t)
        if (!bar) continue
        const liq = checkLiquidation(a, sym, bar.l, bar.h, (t + size) * 1000)
        if (liq.fill) {
          a = liq.account
          emit({ type: 'liquidation', fill: liq.fill, away: true })
          a = sampleEquity(a, liq.fill.time, equity(a, { [sym]: liq.fill.price }), true)
        }
      }
    }
    finishCatchUp(a, now, priceAt)
  } catch {
    // The candles couldn't be loaded: carry on with live prices and try again on the next visit
    useAccount.setState({ catchingUp: false })
    drainQueue()
  }
}

function finishCatchUp(a: Account, now: number, priceAt?: (sym: Sym, time: number) => number | null) {
  const funding = settleFunding(a, now, priceAt ?? ((sym) => prices()[sym] ?? null))
  for (const p of funding.payments) emit({ type: 'funding', sym: p.sym, amount: p.amount })
  commit({ ...funding.account, checkedUntil: Math.max(funding.account.checkedUntil, now) })
  useAccount.setState({ catchingUp: false })
  drainQueue()
}

function drainQueue() {
  const waiting = queued
  queued = []
  waiting.forEach(onWindow)
}

// --- Wiring ------------------------------------------------------------------------------------

let started = false

/** Checks every live price window against the account. Returns a stop function. */
export const watchPrices = () => onPrices(onWindow)

/** Hooks the account up to live prices once per page load. */
export function startAccountWatch() {
  if (started) return
  started = true
  watchPrices()
  // Another tab traded or got liquidated: load what it saved
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) void useAccount.persist.rehydrate()
  })
  void catchUp()
}
