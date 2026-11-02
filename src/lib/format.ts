const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export const fmtUsd = (v: number, digits: 0 | 2 = 2) => (digits === 0 ? usd0 : usd2).format(v)
export const fmtPrice = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '-' : num2.format(v))
export const fmtCompact = (v: number) => compact.format(v)

export function fmtSignedUsd(v: number, digits: 0 | 2 = 2): string {
  const s = fmtUsd(Math.abs(v), digits)
  if (Math.abs(v) < (digits === 0 ? 0.5 : 0.005)) return s
  return v > 0 ? `+${s}` : `-${s}`
}

/** Fraction → percent string. 0.1234 → "12.34%" */
export function fmtPct(v: number | null | undefined, digits = 2, signed = false): string {
  if (v == null || !Number.isFinite(v)) return '-'
  const p = (v * 100).toFixed(digits)
  if (signed && v > 0) return `+${p}%`
  return `${p}%`
}

/** Coin amounts: enough decimals to see a small position, never a sign. */
export function fmtQty(v: number): string {
  const a = Math.abs(v)
  if (a >= 100) return a.toFixed(2)
  if (a >= 1) return a.toFixed(3)
  return a.toFixed(4)
}

export function toneClass(v: number | null | undefined): string {
  if (v == null || Math.abs(v) < 1e-9) return 'text-muted-foreground'
  return v > 0 ? 'text-up' : 'text-down'
}
