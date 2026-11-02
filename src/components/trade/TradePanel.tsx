import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { fmtPct, fmtPrice, fmtQty, fmtSignedUsd, fmtUsd, toneClass } from '@/lib/format'
import { LEVERAGES, useUi, type Leverage, type SizePct } from '@/lib/store'
import { leverageOf, liquidationPrice, roe, sideOf, unrealizedPnl, type OrderRequest, type Position } from '@/lib/trading/engine'
import { cn } from '@/lib/utils'

const SIZES: SizePct[] = [25, 50, 100]

export const positionSide = (p: Position | undefined) => sideOf(p)

/** Desktop side panel: equity, position, order controls. */
export function TradePanel({
  equity,
  totalReturn,
  available,
  position,
  price,
  disabled,
  onOrder,
}: OrderControlsProps & {
  equity: number
  totalReturn: number
  available: number
  position: Position | undefined
  price: number | null
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-xs text-muted-foreground">{t('game.equity')}</div>
        <div className="num mt-1 text-2xl font-semibold tracking-tight">{fmtUsd(equity, 0)}</div>
        <div className="flex items-baseline justify-between">
          <span className={cn('num text-sm', toneClass(totalReturn))}>{fmtPct(totalReturn, 2, true)}</span>
          <span className="num text-xs text-muted-foreground">
            {t('game.available')} {fmtUsd(available, 0)}
          </span>
        </div>
      </div>
      <Separator />
      {/* Every row is always drawn so entering or closing a position never moves the order buttons */}
      <PositionDetails position={position} price={price} fixedRows />
      <OrderControls hasPosition={!!positionSide(position)} disabled={disabled} onOrder={onOrder} />
    </div>
  )
}

/** `fixedRows`: keep every row (blank "-" while flat) so the height never changes. */
export function PositionDetails({
  position: p,
  price,
  fixedRows = false,
}: {
  position: Position | undefined
  price: number | null
  fixedRows?: boolean
}) {
  const { t } = useTranslation()
  const side = positionSide(p)
  const blank = <span className="text-muted-foreground">-</span>
  const mark = price ?? p?.entry ?? 0
  const liq = p ? liquidationPrice(p) : null
  return (
    <div className="space-y-2 text-sm">
      <Row label={t('game.position')}>
        {side ? (
          <span className={side === 'long' ? 'text-up' : 'text-down'}>{t(`game.${side}`)}</span>
        ) : (
          <span className="text-muted-foreground">{t('game.flat')}</span>
        )}
      </Row>
      {p && side ? (
        <>
          <Row label={t('game.leverage')}>{fmtLeverage(leverageOf(p))}</Row>
          <Row label={t('game.qty')}>{fmtQty(p.qty)}</Row>
          <Row label={t('game.avgPrice')}>{fmtPrice(p.entry)}</Row>
          <Row label={t('game.margin')}>{fmtUsd(p.margin, 2)}</Row>
          {liq != null ? (
            <Row label={t('game.liqPrice')}>
              <span className="text-orange-400">{fmtPrice(liq)}</span>
            </Row>
          ) : (
            fixedRows && <Row label={t('game.liqPrice')}>{blank}</Row>
          )}
          <Row label={t('game.pnl')}>
            <span className={toneClass(unrealizedPnl(p, mark))}>
              {fmtSignedUsd(unrealizedPnl(p, mark), 2)}{' '}
              <span className="text-xs">({fmtPct(roe(p, mark), 1, true)})</span>
            </span>
          </Row>
        </>
      ) : (
        fixedRows &&
        (['leverage', 'qty', 'avgPrice', 'margin', 'liqPrice', 'pnl'] as const).map((k) => (
          <Row key={k} label={t(`game.${k}`)}>
            {blank}
          </Row>
        ))
      )}
    </div>
  )
}

/** Leverage as chosen (10x), with a decimal only when adding at another leverage blended it */
export const fmtLeverage = (v: number) => `${Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v) : v.toFixed(1)}x`

interface OrderControlsProps {
  disabled: boolean
  onOrder: (req: OrderRequest) => void
}

/**
 * Size, leverage and the Long / Short / Close buttons.
 * `compact` is the mobile bottom bar: tighter selectors, one row of three big buttons.
 */
export function OrderControls({
  hasPosition,
  disabled,
  onOrder,
  compact = false,
}: OrderControlsProps & { hasPosition: boolean; compact?: boolean }) {
  const { t } = useTranslation()
  const size = useUi((s) => s.size)
  const setSize = useUi((s) => s.setSize)
  const leverage = useUi((s) => s.leverage)
  const setLeverage = useUi((s) => s.setLeverage)

  const send = (req: OrderRequest) => {
    // Short haptic tick on phones that support it
    try {
      navigator.vibrate?.(8)
    } catch {
      /* unsupported */
    }
    onOrder(req)
  }

  const sizeToggle = (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      className={cn(compact && 'w-full')}
      value={String(size)}
      onValueChange={(v) => v && setSize(Number(v) as SizePct)}
    >
      {SIZES.map((s) => (
        <ToggleGroupItem key={s} value={String(s)} className={cn('num text-xs', compact ? 'min-w-0 flex-1 px-0' : 'px-2.5')}>
          {s}%
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
  const leverageToggle = (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      className="w-full"
      value={String(leverage)}
      onValueChange={(v) => v && setLeverage(Number(v) as Leverage)}
    >
      {LEVERAGES.map((l) => (
        <ToggleGroupItem key={l} value={String(l)} className="num min-w-0 flex-1 px-0 text-xs">
          {l}x
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )

  const long = (
    <Button
      size="lg"
      disabled={disabled}
      onClick={() => send({ side: 'long', sizePct: size, leverage })}
      className={cn('bg-up font-semibold text-black hover:bg-up/90 active:scale-[0.97]', compact && 'h-12 text-base')}
    >
      {t('game.long')}
    </Button>
  )
  const short = (
    <Button
      size="lg"
      disabled={disabled}
      onClick={() => send({ side: 'short', sizePct: size, leverage })}
      className={cn('bg-down font-semibold text-white hover:bg-down/90 active:scale-[0.97]', compact && 'h-12 text-base')}
    >
      {t('game.short')}
    </Button>
  )
  const close = (
    <Button
      variant="outline"
      size={compact ? 'lg' : 'default'}
      disabled={disabled || !hasPosition}
      onClick={() => send({ side: 'close', sizePct: 100, leverage })}
      className={cn('active:scale-[0.97]', compact ? 'h-12 text-base' : 'w-full')}
    >
      {t('game.close')}
    </Button>
  )

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,7fr)] gap-2">
          {sizeToggle}
          {leverageToggle}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {long}
          {short}
          {close}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t('game.size')}</span>
        {sizeToggle}
      </div>
      <div className="space-y-2 pt-1">
        <span className="text-xs text-muted-foreground">{t('game.leverage')}</span>
        {leverageToggle}
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        {long}
        {short}
      </div>
      {close}
    </div>
  )
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="num">{children}</span>
    </div>
  )
}
