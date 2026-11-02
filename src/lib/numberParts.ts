/** Where a character sits: before the digits, in the whole part, in the decimals, after the digits */
export type Section = 'pre' | 'int' | 'frac' | 'post'

export interface NumberChar {
  /** Stays the same for "the same character" from one value to the next */
  key: string
  char: string
  section: Section
  /** 0–9 for a digit, null for anything else */
  digit: number | null
}

const isDigit = (c: string) => c >= '0' && c <= '9'

/**
 * Splits a formatted number ("$12,348", "+3.25%", "-") into characters keyed so the same
 * character can be followed from one value to the next.
 *
 * Whole-part digits are keyed by place (ones, tens, …) and decimals by their position after the
 * point, so 9.5 → 10.5 keeps the ones digit and the decimal and adds a tens digit in front. Group
 * separators are keyed by the place they follow. Signs and symbols around the number are keyed by
 * the character itself, so + → - swaps one symbol for another rather than changing it in place.
 */
export function splitNumber(text: string): NumberChar[] {
  const chars = Array.from(text)
  const first = chars.findIndex(isDigit)
  if (first < 0) return dedupe(symbols(chars, 'pre'))

  let last = chars.length - 1
  while (!isDigit(chars[last])) last--
  let point = chars.indexOf('.', first)
  if (point < 0 || point > last) point = last + 1

  const int: NumberChar[] = []
  let place = 0
  for (let i = point - 1; i >= first; i--) {
    const c = chars[i]
    int.push(
      isDigit(c)
        ? { key: `i${place++}`, char: c, section: 'int', digit: Number(c) }
        : { key: `s${place}${c}`, char: c, section: 'int', digit: null },
    )
  }
  int.reverse()

  const frac: NumberChar[] = chars.slice(point, last + 1).map((c, n) =>
    isDigit(c)
      ? { key: `f${n}`, char: c, section: 'frac', digit: Number(c) }
      : { key: `f${n}${c}`, char: c, section: 'frac', digit: null },
  )

  return dedupe([
    ...symbols(chars.slice(0, first), 'pre'),
    ...int,
    ...frac,
    ...symbols(chars.slice(last + 1), 'post'),
  ])
}

/** Symbols keyed by character and how many of it came before */
function symbols(chars: string[], section: Section): NumberChar[] {
  const seen = new Map<string, number>()
  return chars.map((c) => {
    const n = seen.get(c) ?? 0
    seen.set(c, n + 1)
    return { key: `${section}${c}${n}`, char: c, section, digit: null }
  })
}

/** Odd input ("1,,2") could repeat a key; every key has to be unique */
function dedupe(parts: NumberChar[]): NumberChar[] {
  const used = new Set<string>()
  for (const p of parts) {
    while (used.has(p.key)) p.key += "'"
    used.add(p.key)
  }
  return parts
}
