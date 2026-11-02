import { useTranslation } from 'react-i18next'
import { useNow } from '@/hooks/useLive'
import { fmtCompact, fmtPct, fmtPrice, toneClass } from '@/lib/format'
import type { Stats24h } from '@/lib/market/types'
import { CONFIG, FUNDING_INTERVAL_MS, fundingFloor } from '@/lib/trading/engine'
import { cn } from '@/lib/utils'

/** Whole dollars once a price has five digits, so it fits its half of the panel */
const fmtLevel = (v: number | undefined) => (v != null && v >= 10_000 ? fmtUsdPlain(v) : fmtPrice(v))
const fmtUsdPlain = (v: number) => Math.round(v).toLocaleString('en-US')

const pad = (n: number) => String(n).padStart(2, '0')

/** hh:mm:ss until the next funding time */
function countdown(now: number) {
  const left = Math.max(0, fundingFloor(now) + FUNDING_INTERVAL_MS - now)
  const s = Math.floor(left / 1000)
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/** 24-hour numbers and funding for the coin on screen, laid out like the stock game's metrics. */
export function MarketStats({ stats }: { stats: Stats24h | null }) {
  const { t } = useTranslation()
  const now = useNow(1000)
  const change = stats && stats.open > 0 ? stats.last / stats.open - 1 : null
  const rows: [string, string, string?][] = [
    [t('market.change24h'), fmtPct(change, 2, true), toneClass(change)],
    [t('market.volume24h'), stats ? fmtCompact(stats.volume) : '-'],
    [t('market.high24h'), fmtLevel(stats?.high)],
    [t('market.low24h'), fmtLevel(stats?.low)],
    [t('market.funding'), fmtPct(CONFIG.fundingRate, 3)],
    [t('market.nextFunding'), countdown(now)],
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      {rows.map(([label, value, tone]) => (
        <div key={label} className="flex items-baseline justify-between gap-2">
          <dt className="text-xs whitespace-nowrap text-muted-foreground">{label}</dt>
          <dd className={cn('num text-sm', tone)}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
