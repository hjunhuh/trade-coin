import { describe, expect, it } from 'vitest'
import { aggregateWeekly, bollinger, ema, macd, rsi, sma } from './indicators'

const close = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64, 46.21]

describe('sma', () => {
  it('averages the trailing window and nulls the warm-up', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4])
  })
})

describe('ema', () => {
  it('seeds with SMA then applies the 2/(n+1) multiplier', () => {
    const out = ema([1, 2, 3, 4, 5], 3)
    expect(out.slice(0, 2)).toEqual([null, null])
    expect(out[2]).toBeCloseTo(2)
    expect(out[3]).toBeCloseTo(3) // 4*0.5 + 2*0.5
    expect(out[4]).toBeCloseTo(4)
  })
  it('returns all nulls when there is not enough data', () => {
    expect(ema([1, 2], 3)).toEqual([null, null])
  })
})

describe('rsi', () => {
  it('matches the classic Wilder example at full precision', () => {
    const out = rsi(close, 14)
    expect(out[13]).toBeNull()
    expect(out[14]).toBeCloseTo(70.464, 2)
    expect(out[15]).toBeCloseTo(66.25, 1)
  })
  it('is 100 when price only rises', () => {
    const out = rsi([1, 2, 3, 4, 5, 6], 3)
    expect(out[5]).toBe(100)
  })
})

describe('bollinger', () => {
  it('is symmetric around the SMA with population stdev', () => {
    const { upper, middle, lower } = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2)
    expect(middle[7]).toBeCloseTo(5)
    expect(upper[7]).toBeCloseTo(9) // stdev = 2
    expect(lower[7]).toBeCloseTo(1)
    expect(upper[6]).toBeNull()
  })
})

describe('macd', () => {
  it('macd line = fast EMA - slow EMA and histogram = macd - signal', () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 5 + i * 0.2)
    const { macd: line, signal, histogram } = macd(values, 12, 26, 9)
    const f = ema(values, 12)
    const s = ema(values, 26)
    expect(line[24]).toBeNull()
    expect(line[25]).toBeCloseTo((f[25] as number) - (s[25] as number))
    // signal needs 9 macd values: first at index 25 + 8
    expect(signal[32]).toBeNull()
    expect(signal[33]).not.toBeNull()
    expect(histogram[40]).toBeCloseTo((line[40] as number) - (signal[40] as number))
  })
})

describe('aggregateWeekly', () => {
  it('anchors buckets so D0 starts a new week', () => {
    const bars = Array.from({ length: 12 }, (_, i) => {
      const t = i - 6
      return { t, o: t, h: t + 1, l: t - 1, c: t + 0.5, v: 1 }
    })
    const weeks = aggregateWeekly(bars)
    expect(weeks.map((w) => w.t)).toEqual([-10, -5, 0, 5])
    const w0 = weeks[2]
    expect(w0).toEqual({ t: 0, o: 0, h: 5, l: -1, c: 4.5, v: 5 })
  })
})
