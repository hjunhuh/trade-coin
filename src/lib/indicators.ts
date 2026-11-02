// Technical indicators computed only from bars the player has already seen.
// Every function returns an array aligned with the input; warm-up slots are null.

export type Series = (number | null)[]

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  if (period <= 0) return out
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** EMA seeded with the SMA of the first `period` values. */
export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  if (period <= 0 || values.length < period) return out
  const k = 2 / (period + 1)
  let prev = 0
  for (let i = 0; i < period; i++) prev += values[i]
  prev /= period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

export interface BollingerBands { upper: Series; middle: Series; lower: Series }

/** Bollinger bands with population standard deviation (TradingView convention). */
export function bollinger(values: number[], period = 20, mult = 2): BollingerBands {
  const middle = sma(values, period)
  const upper: Series = new Array(values.length).fill(null)
  const lower: Series = new Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    const m = middle[i] as number
    let sq = 0
    for (let j = i - period + 1; j <= i; j++) sq += (values[j] - m) ** 2
    const sd = Math.sqrt(sq / period)
    upper[i] = m + mult * sd
    lower[i] = m - mult * sd
  }
  return { upper, middle, lower }
}

/** RSI with Wilder smoothing. */
export function rsi(values: number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null)
  if (values.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  const calc = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss))
  out[period] = calc()
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = calc()
  }
  return out
}

export interface Macd { macd: Series; signal: Series; histogram: Series }

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): Macd {
  const f = ema(values, fast)
  const s = ema(values, slow)
  const line: Series = values.map((_, i) => (f[i] != null && s[i] != null ? (f[i] as number) - (s[i] as number) : null))
  const firstIdx = line.findIndex((v) => v != null)
  const signal: Series = new Array(values.length).fill(null)
  if (firstIdx >= 0) {
    const compact = line.slice(firstIdx) as number[]
    const sig = ema(compact, signalPeriod)
    sig.forEach((v, i) => (signal[firstIdx + i] = v))
  }
  const histogram: Series = line.map((v, i) => (v != null && signal[i] != null ? v - (signal[i] as number) : null))
  return { macd: line, signal, histogram }
}

export interface OhlcvT { t: number; o: number; h: number; l: number; c: number; v: number }

/**
 * Group bars into 5-trading-day "weeks", anchored so that D0 starts a bucket.
 * A bucket's `t` is its first bar's t, so the bar containing D0 has t=0.
 */
export function aggregateWeekly<T extends OhlcvT>(bars: T[], size = 5): OhlcvT[] {
  const buckets = new Map<number, OhlcvT>()
  const order: number[] = []
  for (const b of bars) {
    const key = Math.floor(b.t / size) * size
    const cur = buckets.get(key)
    if (!cur) {
      buckets.set(key, { t: key, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })
      order.push(key)
    } else {
      cur.h = Math.max(cur.h, b.h)
      cur.l = Math.min(cur.l, b.l)
      cur.c = b.c
      cur.v += b.v
    }
  }
  return order.map((k) => buckets.get(k) as OhlcvT)
}
