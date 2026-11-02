import { useTranslation } from 'react-i18next'
import { ChevronUp } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { fmtPct, fmtPrice, fmtSignedUsd, fmtUsd, toneClass } from '@/lib/format'
import type { Stats24h } from '@/lib/market/types'
import { leverageOf, liquidationPrice, unrealizedPnl, type Position } from '@/lib/trading/engine'
import { cn } from '@/lib/utils'
import { MarketStats } from './MarketStats'
import { fmtLeverage, PositionDetails, positionSide } from './TradePanel'

interface MobileStatusProps {
  equity: number
  totalReturn: number
  position: Position | undefined
  price: number | null
  stats: Stats24h | null
}

/** Mobile one-line summary; tap for position details and market numbers in a bottom sheet. */
export function MobileStatus({ equity, totalReturn, position: p, price, stats }: MobileStatusProps) {
  const { t } = useTranslation()
  const side = positionSide(p)
  const pnl = p ? unrealizedPnl(p, price ?? p.entry) : 0
  const liq = p ? liquidationPrice(p) : null

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="flex h-14 w-full shrink-0 items-center gap-3 border-b px-4 text-left">
          <div className="min-w-0">
            <div className="num text-base leading-tight font-semibold">{fmtUsd(equity, 0)}</div>
            <div className={cn('num text-xs', toneClass(totalReturn))}>{fmtPct(totalReturn, 2, true)}</div>
          </div>
          <div className="ml-auto min-w-0 text-right">
            {p && side ? (
              <>
                <div className="num text-sm leading-tight">
                  <span className={side === 'long' ? 'text-up' : 'text-down'}>
                    {t(`game.${side}`)} {fmtLeverage(leverageOf(p))}
                  </span>{' '}
                  <span className={toneClass(pnl)}>{fmtSignedUsd(pnl, 2)}</span>
                </div>
                {liq != null && (
                  <div className="num text-xs text-orange-400">
                    {t('game.liqPrice')} {fmtPrice(liq)}
                  </div>
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">{t('game.flat')}</span>
            )}
          </div>
          <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="pb-[max(env(safe-area-inset-bottom),1rem)]">
        <SheetHeader className="pb-0">
          <SheetTitle className="num">{fmtUsd(equity, 0)}</SheetTitle>
          <SheetDescription className={cn('num', toneClass(totalReturn))}>{fmtPct(totalReturn, 2, true)}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4">
          <PositionDetails position={p} price={price} />
          <Separator />
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">{t('game.market')}</div>
            <MarketStats stats={stats} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
