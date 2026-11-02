import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ChevronRight, RotateCcw } from 'lucide-react'
import { BalanceChart } from '@/components/BalanceChart'
import { RollingNumber } from '@/components/RollingNumber'
import { FillsTable } from '@/components/account/FillsTable'
import { ResetDialog } from '@/components/account/ResetDialog'
import { CoinIcon } from '@/components/trade/CoinIcon'
import { fmtLeverage } from '@/components/trade/TradePanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useLiveAccount } from '@/hooks/useLive'
import { fmtPct, fmtPrice, fmtQty, fmtSignedUsd, fmtUsd, toneClass } from '@/lib/format'
import { SYMBOLS } from '@/lib/market/types'
import {
  available,
  CONFIG,
  leverageOf,
  liquidationPrice,
  roe,
  sideOf,
  unrealizedPnl,
  type Position,
} from '@/lib/trading/engine'
import { cn } from '@/lib/utils'

const CLOSING = new Set(['close', 'reduce'])

export default function AccountPage() {
  const { t, i18n } = useTranslation()
  const live = useLiveAccount()
  const { account } = live
  const [resetOpen, setResetOpen] = useState(false)

  const positions = SYMBOLS.map((s) => account.positions[s]).filter((p): p is Position => !!p)
  // A round trip counts once it is closed (fully, partly or by liquidation)
  const closed = useMemo(() => account.fills.filter((f) => f.kind === 'liquidation' || CLOSING.has(f.action)), [account.fills])
  const winRate = closed.length ? closed.filter((f) => f.realizedPnl > 0).length / closed.length : null

  const history = account.history
  const values = useMemo(() => history.map((h) => h.equity), [history])
  const when = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
    [i18n.resolvedLanguage],
  )
  const historyLabel = (i: number) => (history[i] ? when.format(new Date(history[i].time)) : '')
  const bust = positions.length === 0 && available(account) < CONFIG.minNotional

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 pt-8 pb-safe-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('account.title')}</h1>
        <Button size="sm" variant="outline" onClick={() => setResetOpen(true)}>
          <RotateCcw />
          {t('account.reset')}
        </Button>
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border md:grid-cols-4">
        <Stat label={t('account.equity')} value={fmtUsd(live.equity, 0)} from={fmtUsd(0, 0)} large />
        <Stat
          label={t('account.totalReturn')}
          value={fmtPct(live.totalReturn, 2, true)}
          from={fmtPct(0, 2)}
          tone={live.totalReturn}
        />
        <Stat label={t('account.trades')} value={String(closed.length)} from="0" />
        <Stat label={t('account.winRate')} value={fmtPct(winRate, 0)} from={fmtPct(0, 0)} />
      </div>

      {bust && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm">
          <span>{t('account.bust')}</span>
          <Button size="sm" onClick={() => setResetOpen(true)}>
            {t('account.reset')}
          </Button>
        </div>
      )}

      {values.length > 1 && (
        <section className="space-y-2">
          <div className="h-56 rounded-xl border p-2">
            <BalanceChart values={values} baseline={account.deposited} label={historyLabel} />
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('account.positions')}</h2>
        <div className="divide-y overflow-hidden rounded-xl border">
          {positions.map((p) => (
            <PositionRow key={p.sym} position={p} price={live.price[p.sym] ?? null} />
          ))}
          {positions.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('account.noPositions')}</p>
          )}
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-xl border p-4 text-sm md:grid-cols-3">
        <Detail label={t('account.balance')} value={fmtUsd(account.balance, 2)} />
        <Detail label={t('account.available')} value={fmtUsd(available(account), 2)} />
        <Detail label={t('account.marginUsed')} value={fmtUsd(live.marginUsed, 2)} />
        <Detail
          label={t('account.unrealized')}
          value={fmtSignedUsd(live.unrealized, 2)}
          className={toneClass(live.unrealized)}
        />
        <Detail label={t('account.fees')} value={fmtUsd(account.feesPaid, 2)} />
        <Detail
          label={t('account.funding')}
          value={fmtSignedUsd(-account.fundingPaid, 2)}
          className={toneClass(-account.fundingPaid)}
        />
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('account.history')}</h2>
        <FillsTable fills={account.fills} />
      </section>

      <p className="text-xs text-muted-foreground">
        {t('account.note', { fee: fmtPct(CONFIG.takerFee, 2), funding: fmtPct(CONFIG.fundingRate, 2) })}
      </p>

      <ResetDialog open={resetOpen} onOpenChange={setResetOpen} initial={account.deposited} />
    </main>
  )
}

function PositionRow({ position: p, price }: { position: Position; price: number | null }) {
  const { t } = useTranslation()
  const side = sideOf(p)!
  const mark = price ?? p.entry
  const pnl = unrealizedPnl(p, mark)
  const liq = liquidationPrice(p)
  return (
    <Link
      to={`/trade/${p.sym}`}
      className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-accent/60 active:bg-accent"
    >
      <CoinIcon sym={p.sym} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{t(`coin.${p.sym}`)}</span>
          <Badge
            className={cn('border-transparent font-normal', side === 'long' ? 'bg-up/15 text-up' : 'bg-down/15 text-down')}
          >
            {t(`game.${side}`)} {fmtLeverage(leverageOf(p))}
          </Badge>
        </div>
        <div className="num truncate text-xs text-muted-foreground">
          {fmtQty(p.qty)} {p.sym} @ {fmtPrice(p.entry)}
          {liq != null && <span className="text-orange-400"> {t('game.liqPrice')} {fmtPrice(liq)}</span>}
        </div>
      </div>
      <div className="text-right">
        <div className={cn('num font-semibold', toneClass(pnl))}>{fmtSignedUsd(pnl, 2)}</div>
        <div className={cn('num text-xs', toneClass(pnl))}>{fmtPct(roe(p, mark), 1, true)}</div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}

function Detail({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('num', className)}>{value}</dd>
    </div>
  )
}

/** `from` is what the value rolls up from each time the page opens */
function Stat({
  label,
  value,
  from,
  tone,
  large,
}: {
  label: string
  value: string
  from: string
  tone?: number | null
  large?: boolean
}) {
  return (
    <div className="border-r border-b p-4 nth-2:border-r-0 nth-[n+3]:border-b-0 md:border-b-0 md:nth-2:border-r md:last:border-r-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('num mt-1 font-semibold', large ? 'text-2xl' : 'text-xl', tone !== undefined && toneClass(tone))}>
        <RollingNumber value={value} from={from} />
      </div>
    </div>
  )
}
