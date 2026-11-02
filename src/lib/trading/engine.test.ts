import { describe, expect, it } from 'vitest'
import {
  available,
  checkLiquidation,
  CONFIG,
  equity,
  FUNDING_INTERVAL_MS,
  leverageOf,
  liquidationPrice,
  newAccount,
  placeOrder,
  sampleEquity,
  settleFunding,
  unrealizedPnl,
  type Config,
} from './engine'

const T0 = Date.UTC(2026, 10, 2, 1, 0, 0)
/** No fees or slippage, so the arithmetic below is exact */
const FREE: Config = { ...CONFIG, takerFee: 0, slippage: 0 }

describe('placeOrder', () => {
  it('opens a leveraged long with the fee taken from the same budget', () => {
    const a = newAccount(T0, 10_000)
    const { account, fills } = placeOrder(a, 'BTC', { side: 'long', sizePct: 50, leverage: 10 }, 100_000, T0)
    const p = account.positions.BTC!
    // budget 5000 = margin + margin * 10 * 0.0005
    const margin = 5000 / 1.005
    expect(p.margin).toBeCloseTo(margin, 6)
    expect(p.entry).toBeCloseTo(100_000 * 1.0001, 6)
    expect(Math.abs(p.qty) * p.entry).toBeCloseTo(margin * 10, 6)
    expect(fills).toHaveLength(1)
    expect(fills[0].action).toBe('open_long')
    expect(account.balance).toBeCloseTo(10_000 - margin * 10 * 0.0005, 6)
    expect(available(account) + p.margin).toBeCloseTo(account.balance, 6)
    expect(leverageOf(p)).toBeCloseTo(10, 6)
    // The original account is untouched
    expect(a.positions.BTC).toBeUndefined()
  })

  it('realizes profit on close and frees the margin', () => {
    let a = newAccount(T0, 1000)
    a = placeOrder(a, 'ETH', { side: 'long', sizePct: 100, leverage: 5 }, 2000, T0, FREE).account
    expect(a.positions.ETH!.qty).toBeCloseTo(2.5, 9)
    const r = placeOrder(a, 'ETH', { side: 'close', sizePct: 100, leverage: 1 }, 2200, T0 + 1, FREE)
    expect(r.account.positions.ETH).toBeUndefined()
    expect(r.fills[0].realizedPnl).toBeCloseTo(500, 9)
    expect(r.account.balance).toBeCloseTo(1500, 9)
    expect(available(r.account)).toBeCloseTo(1500, 9)
  })

  it('profits from a short when the price falls', () => {
    let a = newAccount(T0, 1000)
    a = placeOrder(a, 'BTC', { side: 'short', sizePct: 100, leverage: 2 }, 50_000, T0, FREE).account
    expect(a.positions.BTC!.qty).toBeCloseTo(-0.04, 12)
    expect(unrealizedPnl(a.positions.BTC!, 45_000)).toBeCloseTo(200, 9)
    expect(equity(a, { BTC: 45_000 })).toBeCloseTo(1200, 9)
  })

  it('closes part of a position and keeps the rest on proportional margin', () => {
    let a = newAccount(T0, 1000)
    a = placeOrder(a, 'BTC', { side: 'long', sizePct: 100, leverage: 4 }, 100, T0, FREE).account
    const r = placeOrder(a, 'BTC', { side: 'close', sizePct: 25, leverage: 1 }, 110, T0, FREE)
    const p = r.account.positions.BTC!
    expect(p.qty).toBeCloseTo(30, 9)
    expect(p.margin).toBeCloseTo(750, 9)
    expect(r.fills[0].action).toBe('reduce')
    expect(r.account.balance).toBeCloseTo(1000 + 10 * 10, 9)
  })

  it('averages the entry when adding and flips by closing first', () => {
    let a = newAccount(T0, 1000)
    a = placeOrder(a, 'BTC', { side: 'long', sizePct: 50, leverage: 2 }, 100, T0, FREE).account
    a = placeOrder(a, 'BTC', { side: 'long', sizePct: 100, leverage: 2 }, 200, T0, FREE).account
    const p = a.positions.BTC!
    // 10 at 100 + 5 at 200
    expect(p.qty).toBeCloseTo(15, 9)
    expect(p.entry).toBeCloseTo(2000 / 15, 9)
    expect(p.margin).toBeCloseTo(1000, 9)

    const r = placeOrder(a, 'BTC', { side: 'short', sizePct: 100, leverage: 1 }, 200, T0, FREE)
    expect(r.fills.map((f) => f.action)).toEqual(['close', 'open_short'])
    // Closed 15 at 200 for +1000, then shorted the whole 2000
    expect(r.account.balance).toBeCloseTo(2000, 9)
    expect(r.account.positions.BTC!.qty).toBeCloseTo(-10, 9)
  })

  it('rejects orders it cannot fill', () => {
    const a = newAccount(T0, 1000)
    expect(() => placeOrder(a, 'BTC', { side: 'close', sizePct: 100, leverage: 1 }, 100, T0)).toThrow('no open position')
    expect(() => placeOrder(a, 'BTC', { side: 'long', sizePct: 0, leverage: 1 }, 100, T0)).toThrow()
    expect(() => placeOrder(a, 'BTC', { side: 'long', sizePct: 50, leverage: 101 }, 100, T0)).toThrow()
    expect(() => placeOrder(a, 'BTC', { side: 'long', sizePct: 50, leverage: 2 }, 0, T0)).toThrow()
    const broke = { ...a, balance: 1 }
    expect(() => placeOrder(broke, 'BTC', { side: 'long', sizePct: 100, leverage: 1 }, 100, T0)).toThrow(
      'not enough available balance',
    )
  })

  it('keeps each coin on its own margin', () => {
    let a = newAccount(T0, 1000)
    a = placeOrder(a, 'BTC', { side: 'long', sizePct: 50, leverage: 10 }, 100, T0, FREE).account
    a = placeOrder(a, 'ETH', { side: 'short', sizePct: 100, leverage: 10 }, 10, T0, FREE).account
    expect(a.positions.BTC!.margin).toBeCloseTo(500, 9)
    expect(a.positions.ETH!.margin).toBeCloseTo(500, 9)
    expect(available(a)).toBeCloseTo(0, 9)
  })
})

describe('liquidation', () => {
  it('puts the price where margin plus loss meets maintenance', () => {
    let a = newAccount(T0, 1000)
    a = placeOrder(a, 'BTC', { side: 'long', sizePct: 100, leverage: 10 }, 100, T0, FREE).account
    const p = a.positions.BTC!
    const liq = liquidationPrice(p, FREE)!
    // At the liquidation price, margin + P&L = maintenance x notional
    expect(p.margin + unrealizedPnl(p, liq)).toBeCloseTo(FREE.maintenanceRate * Math.abs(p.qty) * liq, 9)
    expect(liq).toBeLessThan(100)
    expect(liq).toBeGreaterThan(90)

    const short = placeOrder(newAccount(T0, 1000), 'BTC', { side: 'short', sizePct: 100, leverage: 10 }, 100, T0, FREE)
      .account.positions.BTC!
    const sLiq = liquidationPrice(short, FREE)!
    expect(sLiq).toBeGreaterThan(100)
    expect(short.margin + unrealizedPnl(short, sLiq)).toBeCloseTo(FREE.maintenanceRate * Math.abs(short.qty) * sLiq, 9)
  })

  it('moves closer to the entry as leverage grows: about 1 / leverage away', () => {
    let previous = Infinity
    for (const leverage of [2, 5, 10, 25, 50, 100]) {
      for (const side of ['long', 'short'] as const) {
        const p = placeOrder(newAccount(T0, 10_000), 'BTC', { side, sizePct: 100, leverage }, 100_000, T0).account.positions.BTC!
        const distance = Math.abs(liquidationPrice(p)! / p.entry - 1)
        const mm = CONFIG.maintenanceRate
        // Fees come out of the budget, not the margin, so this holds exactly
        expect(distance).toBeCloseTo((1 / leverage - mm) / (side === 'long' ? 1 - mm : 1 + mm), 9)
        if (side === 'long') {
          expect(distance).toBeLessThan(previous)
          previous = distance
        }
      }
    }
    // 100x: half a percent of room
    expect(previous).toBeLessThan(0.006)
  })

  it('has no liquidation price for an unleveraged long', () => {
    const a = placeOrder(newAccount(T0, 1000), 'BTC', { side: 'long', sizePct: 100, leverage: 1 }, 100, T0, FREE).account
    expect(liquidationPrice(a.positions.BTC!, FREE)).toBeNull()
  })

  it('closes the position and takes exactly its margin once touched', () => {
    let a = newAccount(T0, 1000)
    a = placeOrder(a, 'BTC', { side: 'long', sizePct: 50, leverage: 20 }, 100, T0, FREE).account
    const liq = liquidationPrice(a.positions.BTC!, FREE)!
    expect(checkLiquidation(a, 'BTC', liq + 0.01, 101, T0 + 1, FREE).fill).toBeNull()
    const r = checkLiquidation(a, 'BTC', liq - 0.01, 101, T0 + 2, FREE)
    expect(r.fill?.kind).toBe('liquidation')
    expect(r.fill?.price).toBeCloseTo(liq, 9)
    expect(r.account.positions.BTC).toBeUndefined()
    expect(r.account.balance).toBeCloseTo(500, 9)
  })

  it('liquidates a short on the way up', () => {
    let a = newAccount(T0, 1000)
    a = placeOrder(a, 'ETH', { side: 'short', sizePct: 100, leverage: 50 }, 100, T0, FREE).account
    const liq = liquidationPrice(a.positions.ETH!, FREE)!
    expect(checkLiquidation(a, 'ETH', 99, liq - 0.001, T0, FREE).fill).toBeNull()
    expect(checkLiquidation(a, 'ETH', 99, liq + 0.001, T0, FREE).account.balance).toBeCloseTo(0, 9)
  })
})

describe('funding', () => {
  const start = Date.UTC(2026, 10, 2, 0, 0, 0) + 1000

  it('charges longs and pays shorts at each funding time, from margin', () => {
    let a = newAccount(start, 2000)
    a = placeOrder(a, 'BTC', { side: 'long', sizePct: 50, leverage: 10 }, 100, start, FREE).account
    a = placeOrder(a, 'ETH', { side: 'short', sizePct: 100, leverage: 10 }, 10, start, FREE).account
    const before = { btc: a.positions.BTC!.margin, eth: a.positions.ETH!.margin }

    // Two funding times pass: 08:00 and 16:00
    const mark = (sym: string) => (sym === 'BTC' ? 100 : 10)
    const r = settleFunding(a, start + 2 * FUNDING_INTERVAL_MS, mark, FREE)
    expect(r.payments).toHaveLength(4)
    // BTC long: 1000 margin x 10 = 10000 notional = 100 coins
    const btcPay = 100 * 100 * FREE.fundingRate * 2
    // ETH short: the other 1000 x 10 = 10000 notional = 1000 coins, paid to the short
    const ethPay = -1000 * 10 * FREE.fundingRate * 2
    expect(r.account.positions.BTC!.margin).toBeCloseTo(before.btc - btcPay, 9)
    expect(r.account.positions.ETH!.margin).toBeCloseTo(before.eth - ethPay, 9)
    expect(r.account.fundingPaid).toBeCloseTo(btcPay + ethPay, 9)
    expect(available(r.account)).toBeCloseTo(available(a), 9)

    // Settling again at the same time changes nothing
    expect(settleFunding(r.account, start + 2 * FUNDING_INTERVAL_MS, mark, FREE).account).toBe(r.account)
  })

  it('skips positions opened after a funding time', () => {
    let a = newAccount(start, 1000)
    const late = start + FUNDING_INTERVAL_MS + 60_000
    a = placeOrder(a, 'BTC', { side: 'long', sizePct: 100, leverage: 1 }, 100, late, FREE).account
    const r = settleFunding(a, late + 1000, () => 100, FREE)
    expect(r.payments).toHaveLength(0)
    expect(r.account.lastFundingAt).toBe(start - 1000 + FUNDING_INTERVAL_MS)
  })
})

describe('sampleEquity', () => {
  it('samples at most every few minutes unless forced, and stays bounded', () => {
    let a = newAccount(T0, 1000)
    a = sampleEquity(a, T0 + 1000, 1001)
    expect(a.history).toHaveLength(1)
    a = sampleEquity(a, T0 + 1000, 1001, true)
    expect(a.history).toHaveLength(2)
    for (let i = 0; i < 2000; i++) a = sampleEquity(a, T0 + i * 10 * 60_000, 1000 + i)
    expect(a.history.length).toBeLessThanOrEqual(601)
    expect(a.history.at(-1)!.equity).toBe(2999)
    expect(a.history[0].time).toBe(T0)
  })
})
