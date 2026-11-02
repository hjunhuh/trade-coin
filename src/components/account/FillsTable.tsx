import { useTranslation } from 'react-i18next'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmtPrice, fmtQty, fmtSignedUsd, fmtUsd, toneClass } from '@/lib/format'
import type { Fill } from '@/lib/trading/engine'
import { cn } from '@/lib/utils'

const CLOSING = new Set(['close', 'reduce'])

/** Every filled order, newest first. */
export function FillsTable({ fills }: { fills: Fill[] }) {
  const { t, i18n } = useTranslation()
  if (!fills.length) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('account.noFills')}</p>
  }
  const when = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('account.time')}</TableHead>
            <TableHead>{t('account.side')}</TableHead>
            <TableHead className="text-right">{t('account.price')}</TableHead>
            <TableHead className="hidden text-right sm:table-cell">{t('account.amount')}</TableHead>
            <TableHead className="hidden text-right sm:table-cell">{t('account.fee')}</TableHead>
            <TableHead className="text-right">{t('account.realized')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...fills].reverse().map((f) => {
            const liq = f.kind === 'liquidation'
            const action = liq ? 'liquidation' : f.action
            const realized = liq || CLOSING.has(f.action)
            return (
              <TableRow key={f.id}>
                <TableCell className="num text-muted-foreground">{when.format(new Date(f.time))}</TableCell>
                <TableCell>
                  <span className="font-medium">{f.sym}</span>{' '}
                  <span
                    className={cn(
                      liq ? 'text-orange-400' : f.action === 'open_long' || (f.action === 'add' && f.qty > 0) ? 'text-up' : '',
                      !liq && (f.action === 'open_short' || (f.action === 'add' && f.qty < 0)) && 'text-down',
                      !liq && realized && 'text-muted-foreground',
                    )}
                  >
                    {t(`account.action.${action}`)}
                  </span>
                </TableCell>
                <TableCell className="num text-right">{fmtPrice(f.price)}</TableCell>
                <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">{fmtQty(f.qty)}</TableCell>
                <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">{fmtUsd(f.fee, 2)}</TableCell>
                <TableCell className={cn('num text-right', realized ? toneClass(f.realizedPnl) : 'text-muted-foreground')}>
                  {realized ? fmtSignedUsd(f.realizedPnl, 2) : '-'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
