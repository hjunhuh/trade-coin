import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { fmtPct, fmtSignedUsd, toneClass } from '@/lib/format'
import type { Sym } from '@/lib/market/types'
import { leverageOf, roe, sideOf, unrealizedPnl, type Position } from '@/lib/trading/engine'
import { cn } from '@/lib/utils'
import { CoinIcon } from './CoinIcon'
import { fmtLeverage } from './TradePanel'

/** Positions open on the other coins, one tap from their chart. */
export function OtherPositions({
  positions,
  price,
}: {
  positions: Position[]
  price: Partial<Record<Sym, number | null>>
}) {
  const { t } = useTranslation()
  if (!positions.length) return null
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{t('game.otherPositions')}</div>
      <div className="divide-y overflow-hidden rounded-xl border">
        {positions.map((p) => {
          const side = sideOf(p)!
          const mark = price[p.sym] ?? p.entry
          const pnl = unrealizedPnl(p, mark)
          return (
            <Link
              key={p.sym}
              to={`/trade/${p.sym}`}
              replace
              className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent/60 active:bg-accent"
            >
              <CoinIcon sym={p.sym} className="size-7 text-sm" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.sym}</div>
                <div className={cn('num text-xs', side === 'long' ? 'text-up' : 'text-down')}>
                  {t(`game.${side}`)} {fmtLeverage(leverageOf(p))}
                </div>
              </div>
              <div className="text-right">
                <div className={cn('num', toneClass(pnl))}>{fmtSignedUsd(pnl, 2)}</div>
                <div className={cn('num text-xs', toneClass(pnl))}>{fmtPct(roe(p, mark), 1, true)}</div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
