import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { fmtSignedUsd } from '@/lib/format'
import { acquireFeed } from '@/lib/market/feed'
import { onTradeEvent, startAccountWatch } from '@/lib/trading/store'

/**
 * Keeps the market connection open for as long as the app is, checks the account against it,
 * and reports what happened to the positions without the player doing anything.
 */
export function LiveFeed() {
  const { t } = useTranslation()

  useEffect(() => {
    const stop = onTradeEvent((e) => {
      if (e.type === 'liquidation') {
        const key = e.away ? 'event.liquidationAway' : 'event.liquidation'
        toast.error(t(key, { coin: e.fill.sym, pnl: fmtSignedUsd(e.fill.realizedPnl) }), { duration: e.away ? 8000 : 5000 })
      } else if (e.type === 'funding' && Math.abs(e.amount) >= 0.01) {
        toast(t('event.funding', { coin: e.sym, amount: fmtSignedUsd(-e.amount) }))
      }
    })
    return stop
  }, [t])

  useEffect(() => {
    const release = acquireFeed()
    startAccountWatch()
    return release
  }, [])

  return null
}
