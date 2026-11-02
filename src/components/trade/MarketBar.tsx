import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { retryFeed, useMarket } from '@/lib/market/feed'
import { INTERVALS, type Interval } from '@/lib/market/types'
import { useUi } from '@/lib/store'
import { useAccount } from '@/lib/trading/store'
import { cn } from '@/lib/utils'

const SOURCE_NAME = { binance: 'Binance', coinbase: 'Coinbase' } as const

/** Under the chart, where the stock game had its playback controls: feed status, candle size, account. */
export function MarketBar() {
  const { t } = useTranslation()
  const interval = useUi((s) => s.interval)
  const setInterval = useUi((s) => s.setInterval)
  const status = useMarket((s) => s.status)
  const source = useMarket((s) => s.source)
  const catchingUp = useAccount((s) => s.catchingUp)
  const label = catchingUp ? t('feed.catchingUp') : t(`feed.${status}`)

  return (
    <div className="flex h-12 shrink-0 animate-appear items-center gap-2 border-t px-2 sm:gap-3 sm:px-3">
      <button
        type="button"
        onClick={retryFeed}
        disabled={status !== 'error'}
        title={source ? t('feed.source', { source: SOURCE_NAME[source] }) : undefined}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-1.5 text-xs text-muted-foreground disabled:cursor-default"
      >
        <span className="relative flex size-2">
          {status === 'live' && !catchingUp && (
            <span className="absolute inset-0 animate-ping rounded-full bg-up opacity-60 motion-reduce:hidden" />
          )}
          <span
            className={cn(
              'relative size-2 rounded-full',
              status === 'live' && !catchingUp ? 'bg-up' : status === 'error' ? 'bg-down' : 'bg-orange-400',
            )}
          />
        </span>
        <span className="hidden sm:inline">{label}</span>
      </button>
      <ToggleGroup
        type="single"
        size="sm"
        value={interval}
        onValueChange={(v) => v && setInterval(v as Interval)}
        className="min-w-0"
      >
        {INTERVALS.map((i) => (
          <ToggleGroupItem key={i} value={i} className="num min-w-0 px-1.5 text-xs sm:px-2">
            {t(`interval.${i}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <span className="num hidden flex-1 text-right text-xs whitespace-nowrap text-muted-foreground md:inline">
        {source ? t('feed.source', { source: SOURCE_NAME[source] }) : ''}
      </span>
      <Button asChild size="sm" variant="ghost" className="ml-auto text-muted-foreground md:ml-0">
        <Link to="/account" aria-label={t('nav.account')}>
          <Wallet className="size-3.5" />
          <span className="hidden sm:inline">{t('nav.account')}</span>
        </Link>
      </Button>
    </div>
  )
}
