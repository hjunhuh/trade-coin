import { useEffect, useState } from 'react'
import { mergeWindow } from '@/lib/market/candles'
import { marketSource, onPrices, useMarket, type PriceWindow } from '@/lib/market/feed'
import type { Bar, Interval, Sym } from '@/lib/market/types'

/** Candles loaded per chart: enough for the 60-candle average to settle and some history to scroll */
const HISTORY = 720

interface Candles {
  bars: Bar[]
  /** Changes when the candles are replaced wholesale (new coin, interval or source), not on live updates */
  version: number
  loading: boolean
  error: unknown
  retry: () => void
}

/** History from the exchange, then kept current from the live feed. */
export function useCandles(sym: Sym, interval: Interval): Candles {
  const generation = useMarket((s) => s.generation)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ bars: Bar[]; version: number; loading: boolean; error: unknown }>({
    bars: [],
    version: 0,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    let loaded: Bar[] | null = null
    // Trades that arrive while the history downloads are folded in once it's there
    const early: PriceWindow[] = []
    setState((s) => ({ ...s, bars: [], loading: true, error: null }))

    const stop = onPrices((w) => {
      if (w.sym !== sym) return
      if (!loaded) {
        early.push(w)
        return
      }
      const before = loaded
      loaded = mergeWindow(loaded, w, interval)
      if (loaded !== before) {
        const bars = loaded
        setState((s) => ({ ...s, bars }))
      }
    })

    marketSource()
      .then((source) => source.klines(sym, interval, { limit: HISTORY }))
      .then(
        (bars) => {
          if (cancelled) return
          let merged = bars
          for (const w of early) merged = mergeWindow(merged, w, interval)
          loaded = merged
          setState((s) => ({ bars: merged, version: s.version + 1, loading: false, error: null }))
        },
        (error) => {
          if (!cancelled) setState((s) => ({ ...s, loading: false, error }))
        },
      )

    return () => {
      cancelled = true
      stop()
    }
  }, [sym, interval, generation, attempt])

  return { ...state, retry: () => setAttempt((n) => n + 1) }
}
