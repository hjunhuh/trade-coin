import { useNavigate } from 'react-router'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SYMBOLS, type Sym } from '@/lib/market/types'

/** BTC / ETH switch at the top of the chart, sized like the indicator toggles next to it. */
export function SymbolToggles({ sym }: { sym: Sym }) {
  const navigate = useNavigate()
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={sym}
      onValueChange={(v) => v && v !== sym && navigate(`/trade/${v}`, { replace: true })}
    >
      {SYMBOLS.map((s: Sym) => (
        <ToggleGroupItem key={s} value={s} className="num h-7 px-2.5 text-[11px] font-medium">
          {s}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
