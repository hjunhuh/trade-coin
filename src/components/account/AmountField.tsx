import { cleanAmount } from '@/lib/amount'
import { cn } from '@/lib/utils'

/** Big "$ 12,345" amount input used by the money sheets. */
export function AmountField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (text: string) => void
}) {
  return (
    <div className="space-y-3">
      <label className="text-sm text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-baseline gap-1 border-b pb-2">
        <span className={cn('num text-3xl font-semibold', !value && 'text-muted-foreground')}>$</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(cleanAmount(e.target.value))}
          className="num w-full min-w-0 bg-transparent text-3xl font-semibold outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  )
}
