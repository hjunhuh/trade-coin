import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AmountField } from '@/components/account/AmountField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { amountText, parseAmount } from '@/lib/amount'
import { errorText } from '@/lib/errors'
import { fmtUsd } from '@/lib/format'
import { MAX_DEPOSIT, MIN_DEPOSIT } from '@/lib/trading/engine'
import { resetAccount } from '@/lib/trading/store'
import { cn } from '@/lib/utils'

const PRESETS = [1_000, 10_000, 100_000, 1_000_000]

interface ResetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What the field starts at: the amount the current account began with */
  initial: number
}

/** Clears the account and starts it again from an amount the player picks. */
export function ResetDialog({ open, onOpenChange, initial }: ResetDialogProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(() => amountText(initial))
  const value = parseAmount(text)
  const valid = value >= MIN_DEPOSIT && value <= MAX_DEPOSIT

  // Each opening starts from the current account's amount again
  const change = (next: boolean) => {
    if (next) setText(amountText(initial))
    onOpenChange(next)
  }

  const submit = () => {
    if (!valid) return
    try {
      resetAccount(value)
      onOpenChange(false)
      toast(t('account.resetDone', { amount: fmtUsd(value, value % 1 ? 2 : 0) }))
    } catch (err) {
      toast.error(errorText(t, err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="gap-5">
        <DialogHeader>
          <DialogTitle>{t('account.resetTitle')}</DialogTitle>
          <DialogDescription>{t('account.resetBody')}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="space-y-3">
            <AmountField id="reset-amount" label={t('account.resetAmount')} value={text} onChange={setText} />
            <div className={cn('text-xs', text && !valid ? 'text-down' : 'text-muted-foreground')}>
              {t('account.resetRange', { min: fmtUsd(MIN_DEPOSIT, 0), max: fmtUsd(MAX_DEPOSIT, 0) })}
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={value === p ? 'default' : 'secondary'}
                  size="sm"
                  className="num rounded-full"
                  onClick={() => setText(amountText(p))}
                >
                  {fmtUsd(p, 0)}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => change(false)}>
              {t('account.cancel')}
            </Button>
            <Button type="submit" variant="destructive" disabled={!valid}>
              {t('account.resetConfirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
