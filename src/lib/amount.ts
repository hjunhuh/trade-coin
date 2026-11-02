/** Typed amount text → "12,345.6": digits, one dot, two decimals, thousands separators. */
export function cleanAmount(raw: string): string {
  const s = raw.replace(/[^\d.]/g, '')
  const [int, ...rest] = s.split('.')
  const intPart = (int.replace(/^0+(?=\d)/, '') || (rest.length ? '0' : '')).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return rest.length ? `${intPart}.${rest.join('').slice(0, 2)}` : intPart
}

export const parseAmount = (s: string) => Number(s.replace(/,/g, '')) || 0

/** Number → amount text, rounded down to cents (never more than the source). */
export const amountText = (n: number) => cleanAmount(String(Math.floor(n * 100) / 100))
