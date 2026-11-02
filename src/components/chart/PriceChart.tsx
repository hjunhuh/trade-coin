import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AutoscaleInfo,
  CandlestickSeries,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type Time,
} from 'lightweight-charts'
import { bollinger, sma, type Series } from '@/lib/indicators'
import { chartOptions, COLORS, timeFormatters, toTime } from '@/lib/chartTheme'
import { candleOpen, type Bar, type Interval } from '@/lib/market/types'
import type { Indicators } from '@/lib/store'
import type { Fill } from '@/lib/trading/engine'
import { cn } from '@/lib/utils'
import { TradeLabels } from './tradeLabels'

interface PriceChartProps {
  bars: Bar[]
  /** Changes when `bars` is replaced wholesale; otherwise only the last candle moved */
  version: number
  interval: Interval
  indicators: Indicators
  /** The player's fills on this coin, labeled on their candles */
  fills?: Fill[]
  /** Average entry (signed qty decides the color) and liquidation price lines */
  position?: { qty: number; entry: number; liquidationPrice: number | null } | null
  className?: string
}

type Line = ISeriesApi<'Line'>

interface Handles {
  chart: IChartApi
  candle: ISeriesApi<'Candlestick'>
  volume: ISeriesApi<'Histogram'>
  ma20: Line
  ma60: Line
  bbUpper: Line
  bbLower: Line
  tradeLabels: TradeLabels
  priceLines: IPriceLine[]
}

/** Candles in view when a chart loads */
const INITIAL_VIEW = 120

const linePoints = (bars: Bar[], s: Series): LineData<Time>[] =>
  bars.flatMap((b, i) => (s[i] == null ? [] : [{ time: toTime(b.t), value: s[i] as number }]))

const candlePoint = (b: Bar) => ({ time: toTime(b.t), open: b.o, high: b.h, low: b.l, close: b.c })
const volumePoint = (b: Bar) => ({ time: toTime(b.t), value: b.v, color: b.c >= b.o ? COLORS.upVol : COLORS.downVol })

export function PriceChart({ bars, version, interval, indicators, fills = [], position = null, className }: PriceChartProps) {
  const { t, i18n } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const handlesRef = useRef<Handles | null>(null)
  /** The data version the series hold, and the time of the last candle they were given */
  const shownRef = useRef<{ version: number; lastT: number | null }>({ version: -1, lastT: null })
  /** Position levels (entry, liquidation) the price scale must keep in view */
  const levelsRef = useRef<number[]>([])

  // Built once; later prop changes are applied to the same chart.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, chartOptions(i18n.resolvedLanguage ?? 'en', true))

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale('vol').applyOptions({ visible: false, scaleMargins: { top: 0.85, bottom: 0 } })

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderVisible: false,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      priceLineColor: 'rgba(255,255,255,0.3)',
      priceLineStyle: LineStyle.Dotted,
      // The scale normally fits the candles only; stretch it so the position's entry and
      // liquidation lines are always on screen, however far away they are
      autoscaleInfoProvider: (base: () => AutoscaleInfo | null) => {
        const info = base()
        const levels = levelsRef.current
        if (!info?.priceRange || !levels.length) return info
        return {
          ...info,
          priceRange: {
            minValue: Math.min(info.priceRange.minValue, ...levels),
            maxValue: Math.max(info.priceRange.maxValue, ...levels),
          },
        }
      },
    })
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.2 } })

    const line = (color: string) =>
      chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })

    const tradeLabels = new TradeLabels()
    candle.attachPrimitive(tradeLabels)

    handlesRef.current = {
      chart,
      candle,
      volume,
      ma20: line(COLORS.ma20),
      ma60: line(COLORS.ma60),
      bbUpper: line(COLORS.bb),
      bbLower: line(COLORS.bb),
      tradeLabels,
      priceLines: [],
    }
    shownRef.current = { version: -1, lastT: null }
    return () => {
      handlesRef.current = null
      chart.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Time labels follow the language
  useEffect(() => {
    const locale = i18n.resolvedLanguage ?? 'en'
    const f = timeFormatters(locale)
    handlesRef.current?.chart.applyOptions({
      timeScale: { tickMarkFormatter: f.tick },
      localization: { locale, timeFormatter: f.crosshair },
    })
  }, [i18n.resolvedLanguage])

  const closes = useMemo(() => bars.map((b) => b.c), [bars])
  const ma20 = useMemo(() => sma(closes, 20), [closes])
  const ma60 = useMemo(() => sma(closes, 60), [closes])
  const bb = useMemo(() => bollinger(closes, 20, 2), [closes])

  // Data: everything when the candles were replaced, otherwise just the newest candle, so a
  // chart the player has scrolled or zoomed stays where it is.
  useEffect(() => {
    const h = handlesRef.current
    if (!h) return
    const shown = shownRef.current
    const last = bars.at(-1)
    const lines: [Line, Series][] = [
      [h.ma20, ma20],
      [h.ma60, ma60],
      [h.bbUpper, bb.upper],
      [h.bbLower, bb.lower],
    ]

    if (shown.version !== version || shown.lastT == null || !last || last.t < shown.lastT) {
      h.candle.setData(bars.map(candlePoint))
      h.volume.setData(bars.map(volumePoint))
      for (const [series, values] of lines) series.setData(linePoints(bars, values))
      if (bars.length) {
        const to = bars.length - 1 + 6
        h.chart.timeScale().setVisibleLogicalRange({ from: to - INITIAL_VIEW, to })
      }
      shownRef.current = { version, lastT: last?.t ?? null }
      return
    }

    // A new candle may have opened since the last update: finish the previous one first
    const i = bars.length - 1
    const from = last.t > shown.lastT ? Math.max(bars.findIndex((b) => b.t >= shown.lastT!), 0) : i
    for (let k = from; k <= i; k++) {
      const b = bars[k]
      h.candle.update(candlePoint(b))
      h.volume.update(volumePoint(b))
      for (const [series, values] of lines) {
        const v = values[k]
        if (v != null) series.update({ time: toTime(b.t), value: v })
      }
    }
    shownRef.current = { version, lastT: last.t }
  }, [bars, version, ma20, ma60, bb])

  // Indicator visibility
  useEffect(() => {
    const h = handlesRef.current
    if (!h) return
    h.ma20.applyOptions({ visible: indicators.ma })
    h.ma60.applyOptions({ visible: indicators.ma })
    h.bbUpper.applyOptions({ visible: indicators.bb })
    h.bbLower.applyOptions({ visible: indicators.bb })
    h.volume.applyOptions({ visible: indicators.volume })
  }, [indicators])

  // Trade labels: when it was bought or sold and at what price. Liquidations are named as such.
  // Redrawn when a candle opens or closes, not on every price change.
  const firstT = bars[0]?.t
  const lastT = bars.at(-1)?.t
  useEffect(() => {
    const h = handlesRef.current
    if (!h) return
    if (firstT == null || lastT == null) {
      h.tradeLabels.set([], [])
      return
    }
    const shown = fills.filter((f) => {
      const ct = candleOpen(Math.floor(f.time / 1000), interval)
      return ct >= firstT && ct <= lastT
    })
    h.tradeLabels.set(
      shown.map((f) => {
        const buy = f.qty > 0
        const liq = f.kind === 'liquidation'
        const what = liq ? t('trade.liquidation') : t(buy ? 'trade.buy' : 'trade.sell')
        return {
          t: candleOpen(Math.floor(f.time / 1000), interval),
          price: f.price,
          text: `${what} ${f.price.toFixed(2)}`,
          side: buy ? 'buy' : 'sell',
          color: liq ? COLORS.liq : buy ? COLORS.up : COLORS.down,
          ink: liq ? '#1c1917' : buy ? '#052e16' : '#ffffff',
        }
      }),
      bars,
    )
    // `bars` is read for the candles' highs and lows; the labels only move when candles come or go
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fills, firstT, lastT, interval, t, version])

  // Average entry + liquidation lines
  const qty = position?.qty ?? 0
  const entry = position?.entry ?? 0
  const liq = position?.liquidationPrice ?? null
  useEffect(() => {
    const h = handlesRef.current
    if (!h) return
    for (const line of h.priceLines) h.candle.removePriceLine(line)
    h.priceLines = []
    const open = Math.abs(qty) >= 1e-12
    levelsRef.current = open ? [entry, ...(liq != null && liq > 0 ? [liq] : [])] : []
    if (open) {
      const add = (price: number, color: string) =>
        h.priceLines.push(
          h.candle.createPriceLine({ price, color, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: '' }),
        )
      add(entry, qty > 0 ? COLORS.up : COLORS.down)
      if (liq != null && liq > 0) add(liq, COLORS.liq)
    }
    // Refit the scale to the new levels, also after the player dragged it by hand
    h.candle.priceScale().applyOptions({ autoScale: true })
  }, [qty, entry, liq])

  return (
    <div className={cn('relative h-full min-h-0 w-full', className)}>
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
}
