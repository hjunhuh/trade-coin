import { describe, expect, it } from 'vitest'
import { mergeWindow } from './candles'
import type { PriceWindow } from './feed'
import type { Bar } from './types'

const T = 1_800_000_000 - (1_800_000_000 % 3600)
const w = (fromSec: number, prices: number[], volume = 1): PriceWindow => ({
  sym: 'BTC',
  open: prices[0],
  high: Math.max(...prices),
  low: Math.min(...prices),
  last: prices.at(-1)!,
  volume,
  from: fromSec * 1000,
  to: fromSec * 1000 + 200,
})

describe('mergeWindow', () => {
  const bars: Bar[] = [{ t: T, o: 100, h: 105, l: 99, c: 102, v: 10 }]

  it('extends the open candle', () => {
    const next = mergeWindow(bars, w(T + 30, [103, 108, 101]), '1m')
    expect(next).toEqual([{ t: T, o: 100, h: 108, l: 99, c: 101, v: 11 }])
    // The input isn't changed
    expect(bars[0].c).toBe(102)
  })

  it('opens the next candle at the first trade', () => {
    const next = mergeWindow(bars, w(T + 61, [104, 103]), '1m')
    expect(next).toHaveLength(2)
    expect(next[1]).toEqual({ t: T + 60, o: 104, h: 104, l: 103, c: 103, v: 1 })
  })

  it('groups by the chosen interval', () => {
    expect(mergeWindow(bars, w(T + 3599, [90]), '1h')).toHaveLength(1)
    expect(mergeWindow(bars, w(T + 3600, [90]), '1h')).toHaveLength(2)
  })

  it('ignores windows older than the last candle', () => {
    const later: Bar[] = [{ t: T + 60, o: 1, h: 1, l: 1, c: 1, v: 1 }]
    expect(mergeWindow(later, w(T + 10, [5]), '1m')).toBe(later)
  })

  it('starts from nothing', () => {
    expect(mergeWindow([], w(T + 5, [7, 8]), '5m')).toEqual([{ t: T, o: 7, h: 8, l: 7, c: 8, v: 1 }])
  })
})
