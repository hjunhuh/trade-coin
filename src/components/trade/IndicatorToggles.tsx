import { Toggle } from '@/components/ui/toggle'
import { useUi, type Indicators } from '@/lib/store'

const ITEMS: { key: keyof Indicators; label: string }[] = [
  { key: 'ma', label: 'MA' },
  { key: 'bb', label: 'BB' },
  { key: 'volume', label: 'VOL' },
]

export function IndicatorToggles() {
  const indicators = useUi((s) => s.indicators)
  const toggle = useUi((s) => s.toggleIndicator)
  return (
    <div className="flex gap-1">
      {ITEMS.map(({ key, label }) => (
        <Toggle
          key={key}
          size="sm"
          pressed={indicators[key]}
          onPressedChange={() => toggle(key)}
          className="h-7 px-2 text-[11px] font-medium"
        >
          {label}
        </Toggle>
      ))}
    </div>
  )
}
