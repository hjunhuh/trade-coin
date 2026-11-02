import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bar, Interval, MarketSource, Sym } from '../market/types'

// Candles the fake exchange returns, per coin, and what the replay asked for
const candles: Partial<Record<Sym, Bar[]>> = {}
const asked: { sym: Sym; interval: Interval; start?: number }[] = []
const fakeSource: MarketSource = {
  id: 'binance',
  klines: async (sym, interval, opts) => {
    asked.push({ sym, interval, start: opts.start })
    return (candles[sym] ?? []).filter((b) => b.t >= (opts.start ?? 0))
  },
  stats: async () => ({ last: 100, open: 100, high: 100, low: 100, volume: 0 }),
  stream: () => () => {},
}

vi.mock('../market/feed', async () => {
  const { create } = await import('zustand')
  const listeners = new Set<(w: unknown) => void>()
  return {
    marketSource: async () => fakeSource,
    onPrices: (l: (w: unknown) => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    useMarket: create(() => ({ price: { BTC: 100, ETH: 10 } as Record<Sym, number | null> })),
    __emit: (w: unknown) => listeners.forEach((l) => l(w)),
  }
})

const { useAccount, catchUp, order, onTradeEvent, watchPrices, resetAccount } = await import('./store')
const engine = await import('./engine')
const feed = (await import('../market/feed')) as unknown as { __emit: (w: unknown) => void }

const HOUR = 3600_000
const NOW = Date.UTC(2026, 10, 2, 9, 30)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  asked.length = 0
  delete candles.BTC
  delete candles.ETH
})
afterEach(() => vi.useRealTimers())

describe('catchUp', () => {
  it('liquidates a position whose level was crossed while the page was closed', async () => {
    const left = NOW - 3 * HOUR
    let a = engine.newAccount(left - HOUR, 1000)
    a = engine.placeOrder(a, 'BTC', { side: 'long', sizePct: 100, leverage: 20 }, 100, left - HOUR).account
    useAccount.setState({ account: { ...a, checkedUntil: left }, catchingUp: false })
    const liq = engine.liquidationPrice(a.positions.BTC!)!

    const startSec = Math.ceil(left / 1000 / 60) * 60
    candles.BTC = [
      // Before the last check: never looked at, even though it dips
      { t: startSec - 60, o: 100, h: 100, l: liq - 5, c: 100, v: 1 },
      { t: startSec, o: 100, h: 101, l: 99, c: 100, v: 1 },
      { t: startSec + 60, o: 100, h: 100, l: liq - 0.5, c: liq, v: 1 },
      { t: startSec + 120, o: 120, h: 130, l: 120, c: 125, v: 1 },
    ]
    const events: string[] = []
    const stop = onTradeEvent((e) => events.push(e.type === 'liquidation' && e.away ? 'away' : e.type))

    await catchUp()
    stop()

    const after = useAccount.getState()
    expect(after.catchingUp).toBe(false)
    expect(after.account.positions.BTC).toBeUndefined()
    expect(events).toContain('away')
    const fill = after.account.fills.at(-1)!
    expect(fill.kind).toBe('liquidation')
    // At the end of the candle that crossed the level, not later
    expect(fill.time).toBe((startSec + 120) * 1000)
    expect(after.account.checkedUntil).toBe(NOW)
    // Three hours away fits in one-minute candles
    expect(asked[0].interval).toBe('1m')
  })

  it('charges funding times that passed while away and keeps a safe position', async () => {
    // Away from 07:00 to 09:30: the 08:00 funding time passed
    const left = NOW - 2.5 * HOUR
    let a = engine.newAccount(left - HOUR, 1000)
    a = engine.placeOrder(a, 'BTC', { side: 'long', sizePct: 50, leverage: 2 }, 100, left - HOUR).account
    useAccount.setState({ account: { ...a, checkedUntil: left }, catchingUp: false })
    const startSec = Math.ceil(left / 1000 / 60) * 60
    candles.BTC = Array.from({ length: 150 }, (_, i) => ({ t: startSec + i * 60, o: 110, h: 111, l: 109, c: 110, v: 1 }))

    await catchUp()

    const after = useAccount.getState().account
    const p = after.positions.BTC!
    const expected = a.positions.BTC!.qty * 110 * engine.CONFIG.fundingRate
    expect(after.fundingPaid).toBeCloseTo(expected, 9)
    expect(p.margin).toBeCloseTo(a.positions.BTC!.margin - expected, 9)
    expect(after.lastFundingAt).toBe(Date.UTC(2026, 10, 2, 8))
  })

  it('holds live prices and orders until the replay is done', async () => {
    const left = NOW - HOUR
    let a = engine.newAccount(left - HOUR, 1000)
    a = engine.placeOrder(a, 'BTC', { side: 'long', sizePct: 100, leverage: 50 }, 100, left - HOUR).account
    useAccount.setState({ account: { ...a, checkedUntil: left }, catchingUp: false })
    candles.BTC = []
    const liq = engine.liquidationPrice(a.positions.BTC!)!
    const unwatch = watchPrices()

    const running = catchUp()
    expect(useAccount.getState().catchingUp).toBe(true)
    expect(() => order('ETH', { side: 'long', sizePct: 10, leverage: 1 })).toThrow('still replaying')
    // A live price that crosses the level arrives mid-replay: it waits, then liquidates
    feed.__emit({ sym: 'BTC', open: 100, high: 100, low: liq - 1, last: liq - 1, volume: 1, from: NOW, to: NOW })
    expect(useAccount.getState().account.positions.BTC).toBeDefined()
    await running
    unwatch()
    expect(useAccount.getState().account.positions.BTC).toBeUndefined()
  })
})

describe('resetAccount', () => {
  it('starts over from the chosen amount', () => {
    let a = engine.newAccount(NOW, 1000)
    a = engine.placeOrder(a, 'BTC', { side: 'long', sizePct: 50, leverage: 5 }, 100, NOW).account
    useAccount.setState({ account: a, catchingUp: false })

    resetAccount(250_000)
    const after = useAccount.getState().account
    expect(after.balance).toBe(250_000)
    expect(after.deposited).toBe(250_000)
    expect(after.positions).toEqual({})
    expect(after.fills).toEqual([])
    expect(after.history).toEqual([{ time: NOW, equity: 250_000 }])
  })

  it('refuses amounts outside the range and keeps the account', () => {
    const before = useAccount.getState().account
    expect(() => resetAccount(engine.MIN_DEPOSIT - 1)).toThrow('deposit out of range')
    expect(() => resetAccount(engine.MAX_DEPOSIT + 1)).toThrow('deposit out of range')
    expect(() => resetAccount(Number.NaN)).toThrow('deposit out of range')
    expect(useAccount.getState().account).toBe(before)
  })
})
