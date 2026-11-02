import type { PriceWindow } from './feed'
import { candleOpen, type Bar, type Interval } from './types'

/**
 * Folds a window of live trades into the candles: it extends the last candle or starts the
 * next one. Returns the same array when the window is older than the last candle.
 */
export function mergeWindow(bars: Bar[], w: PriceWindow, interval: Interval): Bar[] {
  const t = candleOpen(Math.floor(w.from / 1000), interval)
  const last = bars.at(-1)
  if (last && t < last.t) return bars
  if (last && t === last.t) {
    const next = bars.slice(0, -1)
    next.push({
      t,
      o: last.o,
      h: Math.max(last.h, w.high),
      l: Math.min(last.l, w.low),
      c: w.last,
      v: last.v + w.volume,
    })
    return next
  }
  // A new candle opens at the first price traded in it
  return [...bars, { t, o: w.open, h: w.high, l: w.low, c: w.last, v: w.volume }]
}
