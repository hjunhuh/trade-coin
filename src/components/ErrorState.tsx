import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { errorText } from '@/lib/errors'

interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
  /** Replaces the retry button */
  action?: { label: string; onClick: () => void }
  /** Extra buttons next to retry, e.g. a way out on screens without the side rail */
  children?: ReactNode
}

export function ErrorState({ error, onRetry, action, children }: ErrorStateProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm text-muted-foreground">{errorText(t, error)}</p>
      <div className="flex items-center gap-2">
        {action ? (
          <Button size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('error.retry')}
          </Button>
        )}
        {children}
      </div>
    </div>
  )
}
