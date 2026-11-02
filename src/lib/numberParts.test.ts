import { describe, expect, it } from 'vitest'
import { splitNumber } from './numberParts'

const keys = (text: string) => splitNumber(text).map((p) => p.key)
const sections = (text: string) => splitNumber(text).map((p) => p.section).join(' ')

describe('splitNumber', () => {
  it('keys whole-part digits by place and separators by the place they follow', () => {
    expect(keys('$12,348')).toEqual(['pre$0', 'i4', 'i3', 's3,', 'i2', 'i1', 'i0'])
    expect(splitNumber('$12,348').map((p) => p.digit)).toEqual([null, 1, 2, null, 3, 4, 8])
  })

  it('keys decimals by their position after the point', () => {
    expect(keys('+12.34%')).toEqual(['pre+0', 'i1', 'i0', 'f0.', 'f1', 'f2', 'post%0'])
    expect(sections('+12.34%')).toBe('pre int int frac frac frac post')
  })

  it('keeps the ones digit when a number gains a digit in front', () => {
    const before = keys('9.5')
    const after = keys('10.5')
    expect(after.filter((k) => before.includes(k))).toEqual(['i0', 'f0.', 'f1'])
  })

  it('gives each sign its own key so + and - swap rather than morph', () => {
    expect(keys('-$5')[0]).not.toBe(keys('+$5')[0])
    expect(keys('-$5')[1]).toBe(keys('$5')[0])
  })

  it('treats text without digits as plain symbols', () => {
    expect(splitNumber('-')).toEqual([{ key: 'pre-0', char: '-', section: 'pre', digit: null }])
    expect(splitNumber('')).toEqual([])
  })

  it('leaves a trailing point after the digits', () => {
    expect(sections('12.')).toBe('int int post')
  })

  it('never repeats a key', () => {
    const k = keys('1,,2')
    expect(new Set(k).size).toBe(k.length)
  })
})
