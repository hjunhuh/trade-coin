import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ErrorState } from '@/components/ErrorState'
import { PriceChart } from '@/components/chart/PriceChart'
import { IndicatorToggles } from '@/components/trade/IndicatorToggles'
import { MarketBar } from '@/components/trade/MarketBar'
import { MarketStats } from '@/components/trade/MarketStats'
import { MobileStatus } from '@/components/trade/MobileStatus'
import { OtherPositions } from '@/components/trade/OtherPositions'
import { SymbolToggles } from '@/components/trade/SymbolToggles'
import { OrderControls, positionSide, TradePanel } from '@/components/trade/TradePanel'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useCandles } from '@/hooks/useCandles'
import { useHotkeys } from '@/hooks/useHotkeys'
import { useLiveAccount } from '@/hooks/useLive'
import { AppError, errorText } from '@/lib/errors'
import { fmtPct, fmtPrice, fmtQty, fmtSignedUsd, toneClass } from '@/lib/format'
import { retryFeed, useMarket } from '@/lib/market/feed'
import { isSym, SYMBOLS, type Sym } from '@/lib/market/types'
import { useUi } from '@/lib/store'
import { available, liquidationPrice, type OrderRequest, type Position } from '@/lib/trading/engine'
import { order } from '@/lib/trading/store'
import { cn } from '@/lib/utils'

/** /trade/btc and other spellings land on /trade/BTC */
export default function TradeRoute() {
  const { sym = '' } = useParams()
  const upper = sym.toUpperCase()
  if (!isSym(upper)) return <Navigate to="/" replace />
  if (upper !== sym) return <Navigate to={`/trade/${upper}`} replace />
  return <TradePage key={upper} sym={upper} />
}

/**
 * One screen for trading a coin, laid out like the stock game: the chart with its toggles on the
 * left, equity, position and orders on the right (pinned to the bottom on phones).
 */
function TradePage({ sym }: { sym: Sym }) {
  const { t } = useTranslation()
  const indicators = useUi((s) => s.indicators)
  const interval = useUi((s) => s.interval)
  const size = useUi((s) => s.size)
  const leverage = useUi((s) => s.leverage)
  const setSym = useUi((s) => s.setSym)
  const candles = useCandles(sym, interval)
  const live = useLiveAccount()
  const stats = useMarket((s) => s.stats[sym])
  const feedStatus = useMarket((s) => s.status)
  const price = live.price[sym]
  const position = live.account.positions[sym]

  useEffect(() => setSym(sym), [sym, setSym])

  // The tab title follows the price, so it can be watched from another tab
  useEffect(() => {
    document.title = price ? `${fmtPrice(price)} ${sym} | Trade Coin` : 'Trade Coin'
  }, [price, sym])
  useEffect(() => () => void (document.title = 'Trade Coin'), [])

  const send = useCallback(
    (req: OrderRequest) => {
      try {
        const fills = order(sym, req)
        const closing = fills.filter((f) => f.action === 'close' || f.action === 'reduce')
        const opening = fills.find((f) => f.action !== 'close' && f.action !== 'reduce')
        if (closing.length) {
          toast(t('event.closed', { pnl: fmtSignedUsd(closing.reduce((s, f) => s + f.realizedPnl, 0)) }))
        }
        if (opening) {
          toast(
            t('event.opened', {
              side: t(opening.qty > 0 ? 'game.long' : 'game.short'),
              qty: fmtQty(opening.qty),
              coin: sym,
              price: fmtPrice(opening.price),
            }),
          )
        }
      } catch (err) {
        toast.error(errorText(t, err))
      }
    },
    [sym, t],
  )

  const ready = price != null && !live.catchingUp
  useHotkeys(
    {
      l: () => send({ side: 'long', sizePct: size, leverage }),
      ArrowUp: () => send({ side: 'long', sizePct: size, leverage }),
      s: () => send({ side: 'short', sizePct: size, leverage }),
      ArrowDown: () => send({ side: 'short', sizePct: size, leverage }),
      c: () => positionSide(position) && send({ side: 'close', sizePct: 100, leverage }),
    },
    ready,
  )

  const fills = useMemo(() => live.account.fills.filter((f) => f.sym === sym), [live.account.fills, sym])
  const others = SYMBOLS.filter((s) => s !== sym)
    .map((s) => live.account.positions[s])
    .filter((p): p is Position => !!p)
  const chartPosition = position ? { qty: position.qty, entry: position.entry, liquidationPrice: liquidationPrice(position) } : null
  const change = stats && stats.open > 0 && price ? price / stats.open - 1 : null
  const failed = (candles.error && !candles.bars.length) || feedStatus === 'error'

  return (
    <div className="flex h-dvh animate-appear flex-col">
      {/* Mobile: one-line summary on top (details in a sheet) */}
      <div className="animate-appear lg:hidden">
        <MobileStatus equity={live.equity} totalReturn={live.totalReturn} position={position} price={price} stats={stats} />
      </div>

      <main className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex min-h-0 flex-1 flex-col lg:border-r">
          <div className="flex h-9 shrink-0 items-center gap-2 px-3 sm:gap-3 lg:h-10">
            <SymbolToggles sym={sym} />
            <IndicatorToggles />
            <div className="ml-auto flex min-w-0 animate-appear items-center gap-2">
              <span className="hidden truncate text-sm font-medium md:inline">{t(`coin.${sym}`)}</span>
              <span className="num text-sm font-medium">{fmtPrice(price)}</span>
              <span className={cn('num hidden text-xs min-[420px]:inline', toneClass(change))}>{fmtPct(change, 2, true)}</span>
              <Badge variant="secondary" className="hidden font-normal sm:inline-flex">
                {t('game.perp')}
              </Badge>
              <Badge variant="outline" className="hidden font-normal text-muted-foreground xl:inline-flex">
                {t('game.virtual')}
              </Badge>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {candles.bars.length ? (
              <PriceChart
                className="animate-appear"
                bars={candles.bars}
                version={candles.version}
                interval={interval}
                indicators={indicators}
                fills={fills}
                position={chartPosition}
              />
            ) : failed ? (
              <div className="flex h-full flex-col">
                <ErrorState
                  error={candles.error ?? new AppError('unreachable', 'feed down', 0)}
                  onRetry={() => {
                    retryFeed()
                    candles.retry()
                  }}
                />
              </div>
            ) : (
              <Skeleton className="m-3 h-[calc(100%-1.5rem)]" />
            )}
          </div>
          <MarketBar />
        </section>

        <aside className="hidden overflow-y-auto p-5 lg:block">
          <div className="flex animate-appear flex-col gap-6">
            <TradePanel
              equity={live.equity}
              totalReturn={live.totalReturn}
              available={available(live.account)}
              position={position}
              price={price}
              disabled={!ready}
              onOrder={send}
            />
            <Separator />
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">{t('game.market')}</div>
              <MarketStats stats={stats} />
            </div>
            <OtherPositions positions={others} price={live.price} />
          </div>
        </aside>
      </main>

      {/* Mobile: order controls pinned to the bottom, always one tap away */}
      <div className="shrink-0 animate-appear border-t bg-background px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] lg:hidden">
        <OrderControls compact hasPosition={!!positionSide(position)} disabled={!ready} onOrder={send} />
      </div>
    </div>
  )
}
