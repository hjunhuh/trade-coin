import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { INTERVALS, SYMBOLS, type Interval, type Sym } from './market/types'

export type SizePct = 25 | 50 | 100
export const LEVERAGES = [1, 2, 5, 10, 25, 50, 100] as const
export type Leverage = (typeof LEVERAGES)[number]

export interface Indicators {
  ma: boolean
  bb: boolean
  volume: boolean
}

interface UiState {
  indicators: Indicators
  toggleIndicator: (key: keyof Indicators) => void
  interval: Interval
  setInterval: (i: Interval) => void
  size: SizePct
  setSize: (s: SizePct) => void
  leverage: Leverage
  setLeverage: (l: Leverage) => void
  /** The coin shown last, opened again from the home screen */
  sym: Sym
  setSym: (s: Sym) => void
}

// localStorage can throw (private mode, blocked storage); fall back to memory.
const memory = new Map<string, string>()
export const safeStorage = {
  getItem: (k: string): string | null => {
    try {
      return localStorage.getItem(k)
    } catch {
      return memory.get(k) ?? null
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      memory.set(k, v)
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k)
    } catch {
      memory.delete(k)
    }
  },
} satisfies StateStorage

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      indicators: { ma: true, bb: false, volume: true },
      toggleIndicator: (key) => set((s) => ({ indicators: { ...s.indicators, [key]: !s.indicators[key] } })),
      interval: '1m',
      setInterval: (interval) => set({ interval }),
      size: 50,
      setSize: (size) => set({ size }),
      leverage: 1,
      setLeverage: (leverage) => set({ leverage }),
      sym: 'BTC',
      setSym: (sym) => set({ sym }),
    }),
    {
      name: 'trade-coin.ui.v1',
      storage: createJSONStorage(() => safeStorage),
      // Ignore stored values that are no longer offered.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>
        return {
          ...current,
          ...p,
          interval: INTERVALS.includes(p.interval as Interval) ? (p.interval as Interval) : current.interval,
          leverage: LEVERAGES.includes(p.leverage as Leverage) ? (p.leverage as Leverage) : current.leverage,
          size: ([25, 50, 100] as const).includes(p.size as SizePct) ? (p.size as SizePct) : current.size,
          sym: SYMBOLS.includes(p.sym as Sym) ? (p.sym as Sym) : current.sym,
        }
      },
    },
  ),
)
