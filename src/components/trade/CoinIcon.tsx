import type { Sym } from '@/lib/market/types'
import { cn } from '@/lib/utils'

const STYLE: Record<Sym, { glyph: string; className: string }> = {
  BTC: { glyph: '₿', className: 'bg-[#f7931a]/15 text-[#f7931a]' },
  ETH: { glyph: 'Ξ', className: 'bg-[#8b9cf4]/15 text-[#8b9cf4]' },
}

/** Round badge identifying the coin, the same shape as the account badges. */
export function CoinIcon({ sym, className }: { sym: Sym; className?: string }) {
  const s = STYLE[sym]
  return (
    <span
      aria-hidden
      className={cn('flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-semibold', s.className, className)}
    >
      {s.glyph}
    </span>
  )
}
