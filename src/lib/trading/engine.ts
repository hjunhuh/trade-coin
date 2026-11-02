// A virtual perpetual futures account: one wallet in USD, at most one position per coin, each on
// its own (isolated) margin. Market orders fill at the live price with a small slippage and a
// taker fee; a position whose losses eat its margin down to the maintenance level is liquidated;
// every 8 hours open positions pay or receive funding.
//
// Every function here is pure: it takes an account and returns a new one, so the store can keep
// the old state if an order fails and tests can replay prices exactly.

import { AppError } from '../errors'
import type { Sym } from '../market/types'

const EPS = 1e-12

export interface Config {
  /** Fee on the filled notional of every market order (0.0005 = 0.05%) */
  takerFee: number
  /** How far a market order fills from the last trade, against the trader */
  slippage: number
  /** A position is liquidated when margin + unrealized P&L falls to this share of its notional */
  maintenanceRate: number
  /** Paid by longs to shorts on each funding time, as a share of notional (negative: shorts pay) */
  fundingRate: number
  maxLeverage: number
  /** Smallest notional an order may open, in USD */
  minNotional: number
}

export const CONFIG: Config = {
  takerFee: 0.0005,
  slippage: 0.0001,
  maintenanceRate: 0.005,
  fundingRate: 0.0001,
  maxLeverage: 100,
  minNotional: 5,
}

export const STARTING_BALANCE = 10_000

/** Funding is settled at 00:00, 08:00 and 16:00 UTC */
export const FUNDING_INTERVAL_MS = 8 * 3600 * 1000

export type Side = 'long' | 'short'
export type OrderSide = Side | 'close'
export type FillKind = 'market' | 'liquidation'
export type FillAction = 'open_long' | 'open_short' | 'add' | 'reduce' | 'close'

export interface Position {
  sym: Sym
  /** Signed coin amount: + long, - short */
  qty: number
  /** Average entry price */
  entry: number
  /** USD set aside for this position; the most it can lose */
  margin: number
  /** ms */
  openedAt: number
}

export interface Fill {
  id: string
  sym: Sym
  /** ms */
  time: number
  kind: FillKind
  action: FillAction
  /** Signed: + buy, - sell */
  qty: number
  price: number
  fee: number
  /** P&L this fill made real, net of its fee (0 for fills that only open or add) */
  realizedPnl: number
  /** Leverage of the position right after this fill (0 once closed) */
  leverage: number
}

export interface EquityPoint {
  /** ms */
  time: number
  equity: number
}

export interface Account {
  /** Wallet balance: deposits plus realized P&L, fees and funding. Includes the margin in use. */
  balance: number
  /** Money put in, for the total return */
  deposited: number
  positions: Partial<Record<Sym, Position>>
  /** Oldest first */
  fills: Fill[]
  feesPaid: number
  /** Net funding paid (+) or received (-) */
  fundingPaid: number
  /** The funding time (ms) settled most recently */
  lastFundingAt: number
  /** Up to this time (ms) every price has been checked against the open positions */
  checkedUntil: number
  history: EquityPoint[]
  createdAt: number
}

export interface OrderRequest {
  side: OrderSide
  /** Share of the available balance used as margin (long / short), or of the position to close */
  sizePct: number
  leverage: number
}

const ERRORS = {
  invalid_size: 'size must be between 1 and 100%',
  invalid_leverage: 'leverage out of range',
  no_position: 'no open position',
  insufficient_balance: 'not enough available balance',
  too_small: 'order too small',
  no_price: 'no live price yet',
} as const

export const orderError = (code: keyof typeof ERRORS) => new AppError(code, ERRORS[code])

let seq = 0
const fillId = (time: number) => `${time.toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`

/** Latest funding time at or before `ms`. */
export const fundingFloor = (ms: number) => Math.floor(ms / FUNDING_INTERVAL_MS) * FUNDING_INTERVAL_MS

export function newAccount(now: number, deposit = STARTING_BALANCE): Account {
  return {
    balance: deposit,
    deposited: deposit,
    positions: {},
    fills: [],
    feesPaid: 0,
    fundingPaid: 0,
    lastFundingAt: fundingFloor(now),
    checkedUntil: now,
    history: [{ time: now, equity: deposit }],
    createdAt: now,
  }
}

export const sideOf = (p: Position | undefined): Side | null =>
  !p ? null : p.qty > EPS ? 'long' : p.qty < -EPS ? 'short' : null

export const notional = (p: Position) => Math.abs(p.qty) * p.entry

/** Effective leverage: entry notional over margin. */
export const leverageOf = (p: Position) => (p.margin > EPS ? notional(p) / p.margin : 0)

export const unrealizedPnl = (p: Position, price: number) => (price - p.entry) * p.qty

/** Return on the position's margin. */
export const roe = (p: Position, price: number) => (p.margin > EPS ? unrealizedPnl(p, price) / p.margin : 0)

export const marginInUse = (a: Account) => Object.values(a.positions).reduce((s, p) => s + (p?.margin ?? 0), 0)

/** Balance not tied up as margin: what new orders can use. */
export const available = (a: Account) => Math.max(a.balance - marginInUse(a), 0)

/** Balance plus every open position marked at `prices` (at its entry when there's no price). */
export function equity(a: Account, prices: Partial<Record<Sym, number | null>>): number {
  let e = a.balance
  for (const p of Object.values(a.positions)) {
    if (!p) continue
    const px = prices[p.sym]
    e += unrealizedPnl(p, px != null && px > 0 ? px : p.entry)
  }
  return e
}

/**
 * Price at which the position is liquidated: margin + unrealized P&L = maintenance × notional.
 * Null when it can't be reached (an unleveraged long only hits it at a price of zero).
 */
export function liquidationPrice(p: Position, cfg: Config = CONFIG): number | null {
  const s = sideOf(p)
  if (!s) return null
  const n = Math.abs(p.qty)
  const mm = cfg.maintenanceRate
  const price =
    s === 'long'
      ? // (entry - P) * n = m - mm * n * P  ->  P = (entry * n - m) / (n * (1 - mm))
        (p.entry * n - p.margin) / (n * (1 - mm))
      : // (P - entry) * n = m - mm * n * P  ->  P = (entry * n + m) / (n * (1 + mm))
        (p.entry * n + p.margin) / (n * (1 + mm))
  return price > p.entry * 1e-6 ? price : null
}

const clone = (a: Account): Account => ({
  ...a,
  positions: { ...a.positions },
  fills: [...a.fills],
  history: [...a.history],
})

const MAX_FILLS = 1000

function record(a: Account, fill: Omit<Fill, 'id'>) {
  a.fills.push({ id: fillId(fill.time), ...fill })
  if (a.fills.length > MAX_FILLS) a.fills.splice(0, a.fills.length - MAX_FILLS)
}

/** Closes `qty` (unsigned, at most the position) at `refPrice` with slippage and fee. */
function reduce(a: Account, cfg: Config, sym: Sym, qty: number, refPrice: number, time: number): Fill {
  const p = a.positions[sym]!
  const sign = Math.sign(p.qty)
  const closed = Math.min(qty, Math.abs(p.qty))
  // Selling a long fills a little lower, buying back a short a little higher
  const price = sign > 0 ? refPrice * (1 - cfg.slippage) : refPrice * (1 + cfg.slippage)
  const fee = closed * price * cfg.takerFee
  const gross = (price - p.entry) * closed * sign
  const share = closed / Math.abs(p.qty)
  const remaining = Math.abs(p.qty) - closed
  const done = remaining <= Math.abs(p.qty) * 1e-9

  a.balance += gross - fee
  a.feesPaid += fee
  if (done) {
    delete a.positions[sym]
  } else {
    a.positions[sym] = { ...p, qty: sign * remaining, margin: p.margin * (1 - share) }
  }
  const after = a.positions[sym]
  const fill: Omit<Fill, 'id'> = {
    sym,
    time,
    kind: 'market',
    action: done ? 'close' : 'reduce',
    qty: -sign * closed,
    price,
    fee,
    realizedPnl: gross - fee,
    leverage: after ? leverageOf(after) : 0,
  }
  record(a, fill)
  return a.fills.at(-1)!
}

/**
 * Market order on `sym` at the live `price`. Long and short use `sizePct` of the available
 * balance as margin (the fee comes out of the same amount) at `leverage`; an order against the
 * open position closes it first and then opens the new side. Close takes `sizePct` of the position.
 */
export function placeOrder(
  account: Account,
  sym: Sym,
  req: OrderRequest,
  price: number,
  time: number,
  cfg: Config = CONFIG,
): { account: Account; fills: Fill[] } {
  if (!(price > 0)) throw orderError('no_price')
  if (!(req.sizePct > 0 && req.sizePct <= 100)) throw orderError('invalid_size')
  const a = clone(account)
  const fills: Fill[] = []
  const cur = sideOf(a.positions[sym])

  if (req.side === 'close') {
    if (!cur) throw orderError('no_position')
    const p = a.positions[sym]!
    fills.push(reduce(a, cfg, sym, (Math.abs(p.qty) * req.sizePct) / 100, price, time))
    return { account: a, fills }
  }

  if (!(req.leverage >= 1 && req.leverage <= cfg.maxLeverage)) throw orderError('invalid_leverage')
  if (cur && cur !== req.side) fills.push(reduce(a, cfg, sym, Math.abs(a.positions[sym]!.qty), price, time))

  const budget = (available(a) * req.sizePct) / 100
  // margin + fee = budget, with fee = margin * leverage * takerFee
  const margin = budget / (1 + req.leverage * cfg.takerFee)
  const size = margin * req.leverage
  if (margin <= EPS) throw orderError('insufficient_balance')
  if (size < cfg.minNotional) throw orderError(available(a) * req.leverage < cfg.minNotional ? 'insufficient_balance' : 'too_small')

  const fillPrice = req.side === 'long' ? price * (1 + cfg.slippage) : price * (1 - cfg.slippage)
  const qty = size / fillPrice
  const fee = size * cfg.takerFee
  const signed = req.side === 'long' ? qty : -qty
  const prev = a.positions[sym]
  const next: Position = prev
    ? {
        ...prev,
        qty: prev.qty + signed,
        entry: (Math.abs(prev.qty) * prev.entry + qty * fillPrice) / (Math.abs(prev.qty) + qty),
        margin: prev.margin + margin,
      }
    : { sym, qty: signed, entry: fillPrice, margin, openedAt: time }
  a.positions[sym] = next
  a.balance -= fee
  a.feesPaid += fee
  record(a, {
    sym,
    time,
    kind: 'market',
    action: prev ? 'add' : req.side === 'long' ? 'open_long' : 'open_short',
    qty: signed,
    price: fillPrice,
    fee,
    realizedPnl: 0,
    leverage: leverageOf(next),
  })
  fills.push(a.fills.at(-1)!)
  return { account: a, fills }
}

/**
 * Checks the open position on `sym` against the lowest and highest price traded since the last
 * check. A position whose liquidation price was touched is closed there and loses its margin.
 */
export function checkLiquidation(
  account: Account,
  sym: Sym,
  low: number,
  high: number,
  time: number,
  cfg: Config = CONFIG,
): { account: Account; fill: Fill | null } {
  const p = account.positions[sym]
  const s = sideOf(p)
  if (!p || !s) return { account, fill: null }
  const liq = liquidationPrice(p, cfg)
  const hit = p.margin <= EPS || (liq != null && (s === 'long' ? low <= liq : high >= liq))
  if (!hit) return { account, fill: null }

  const a = clone(account)
  delete a.positions[sym]
  a.balance -= p.margin
  record(a, {
    sym,
    time,
    kind: 'liquidation',
    action: 'close',
    qty: -p.qty,
    price: liq ?? (s === 'long' ? low : high),
    fee: 0,
    realizedPnl: -p.margin,
    leverage: 0,
  })
  return { account: a, fill: a.fills.at(-1)! }
}

/**
 * Settles every funding time after the last one settled, up to `now`. Each open position pays
 * (long) or receives (short) `fundingRate` of its notional at `price(sym, time)`, out of or into
 * its own margin, as on an exchange's isolated margin. Returns the account unchanged when
 * there's nothing to settle.
 */
export function settleFunding(
  account: Account,
  now: number,
  price: (sym: Sym, time: number) => number | null,
  cfg: Config = CONFIG,
): { account: Account; payments: { sym: Sym; time: number; amount: number }[] } {
  const due = fundingFloor(now)
  if (due <= account.lastFundingAt) return { account, payments: [] }
  const a = clone(account)
  const payments: { sym: Sym; time: number; amount: number }[] = []
  for (let t = account.lastFundingAt + FUNDING_INTERVAL_MS; t <= due; t += FUNDING_INTERVAL_MS) {
    for (const p of Object.values(a.positions)) {
      // Positions opened after this funding time owe nothing for it
      if (!p || p.openedAt > t) continue
      const px = price(p.sym, t)
      if (px == null || !(px > 0)) continue
      // + paid by the trader, - received
      const amount = p.qty * px * cfg.fundingRate
      a.balance -= amount
      a.fundingPaid += amount
      a.positions[p.sym] = { ...p, margin: p.margin - amount }
      payments.push({ sym: p.sym, time: t, amount })
    }
  }
  a.lastFundingAt = due
  return { account: a, payments }
}

const MAX_HISTORY = 600
/** Equity is sampled at most this often, plus after every fill */
export const HISTORY_EVERY_MS = 5 * 60 * 1000

/** Adds an equity sample, thinning the oldest half when the history is full. */
export function sampleEquity(a: Account, time: number, value: number, force = false): Account {
  const last = a.history.at(-1)
  if (!force && last && time - last.time < HISTORY_EVERY_MS) return a
  let history = [...a.history, { time, equity: value }]
  if (history.length > MAX_HISTORY) {
    const half = Math.floor(history.length / 2)
    history = [...history.slice(0, half).filter((_, i) => i % 2 === 0), ...history.slice(half)]
  }
  return { ...a, history }
}
