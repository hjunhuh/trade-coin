import { describe, expect, it } from 'vitest'
import { collect, type PageFetcher } from './paging'
import type { Bar } from './types'

/** A fake exchange with one candle a minute from t=0 to t=60*(n-1), answering like Binance does */
function exchange(n: number, perPage: number) {
  const all: Bar[] = Array.from({ length: n }, (_, i) => ({ t: i * 60, o: i, h: i, l: i, c: i, v: 1 }))
  let calls = 0
  const fetchPage: PageFetcher = async (start, end, want) => {
    calls++
    const k = Math.min(want, perPage)
    if (start != null) return all.filter((b) => b.t >= start && b.t <= end).slice(0, k)
    return all.filter((b) => b.t <= end).slice(-k)
  }
  return { fetchPage, calls: () => calls }
}

describe('collect', () => {
  it('pages backward for the latest candles', async () => {
    const ex = exchange(2500, 1000)
    const bars = await collect(ex.fetchPage, 1000, 60, { end: 2499 * 60, limit: 1500 })
    expect(bars).toHaveLength(1500)
    expect(bars[0].t).toBe(1000 * 60)
    expect(bars.at(-1)!.t).toBe(2499 * 60)
    expect(ex.calls()).toBe(2)
  })

  it('pages forward from a start time', async () => {
    const ex = exchange(2500, 1000)
    const bars = await collect(ex.fetchPage, 1000, 60, { start: 100 * 60, end: 2400 * 60, limit: 10_000 })
    expect(bars[0].t).toBe(100 * 60)
    expect(bars.at(-1)!.t).toBe(2400 * 60)
    expect(bars).toHaveLength(2301)
    // Strictly increasing, no duplicates
    expect(bars.every((b, i) => i === 0 || b.t > bars[i - 1].t)).toBe(true)
  })

  it('stops when the exchange runs out', async () => {
    const ex = exchange(50, 1000)
    expect(await collect(ex.fetchPage, 1000, 60, { end: 10_000, limit: 500 })).toHaveLength(50)
    expect(ex.calls()).toBe(1)
  })
})
