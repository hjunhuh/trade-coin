import { useEffect, useRef } from 'react'
import { AreaSeries, createChart, LineStyle, type IChartApi, type Time, type UTCTimestamp } from 'lightweight-charts'
import { chartOptions } from '@/lib/chartTheme'
import { fmtUsd } from '@/lib/format'
import { advance, reducedMotion, spring } from '@/lib/motion'

// Points are spaced evenly by index, whatever time passed between them; `label` names each one.
const BASE = Date.UTC(2000, 0, 3) / 1000
const indexTime = (i: number) => (BASE + i * 86400) as UTCTimestamp
const timeIndex = (time: Time) => Math.round(((time as number) - BASE) / 86400)

interface BalanceChartProps {
  /** Equity at each sample, oldest first */
  values: number[]
  baseline: number
  label: (index: number) => string
}

export function BalanceChart({ values, baseline, label }: BalanceChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const labelRef = useRef(label)
  labelRef.current = label
  // Draws in once each time the page opens; new data later just replaces the chart
  const drawnRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const base = chartOptions('en', false)
    const chart = createChart(el, {
      ...base,
      timeScale: { borderVisible: false, visible: false },
      localization: {
        ...base.localization,
        timeFormatter: (time: Time) => labelRef.current(timeIndex(time)),
        priceFormatter: (p: number) => fmtUsd(p, 0),
      },
    })
    const up = (values.at(-1) ?? baseline) >= baseline
    const color = up ? '#22c55e' : '#ef4444'
    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      lineWidth: 2,
      topColor: up ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
      bottomColor: 'rgba(0,0,0,0)',
      priceLineVisible: false,
    })
    series.setData(values.map((v, i) => ({ time: indexTime(i), value: v })))
    series.createPriceLine({
      price: baseline,
      color: 'rgba(255,255,255,0.2)',
      lineStyle: LineStyle.Dashed,
      lineWidth: 1,
      axisLabelVisible: false,
      title: '',
    })
    chart.timeScale().fitContent()
    const stopDrawIn =
      drawnRef.current || reducedMotion() ? null : drawIn(el, chart, () => (drawnRef.current = true))
    return () => {
      stopDrawIn?.()
      chart.remove()
    }
  }, [values, baseline])

  return <div ref={ref} className="h-full w-full" />
}

/** Width of the reveal's soft leading edge, px */
const EDGE = 48

/**
 * Reveals the plot left to right on the same spring the account numbers roll on, so the line
 * reaches the latest balance just as the total settles. The leading edge is soft, so the line
 * looks drawn rather than wiped, and the price axis stays in view throughout.
 * Returns a stop function; `onDone` runs only if it gets to finish.
 */
function drawIn(el: HTMLElement, chart: IChartApi, onDone: () => void) {
  const progress = spring(0)
  progress.target = 1
  let last = -1
  // Hidden until the chart has laid itself out and the plot's width is known
  el.style.mask = 'linear-gradient(transparent, transparent)'

  const step = (now: number) => {
    const plot = chart.paneSize().width
    if (plot > 0) {
      const dt = last < 0 ? 0 : Math.min((now - last) / 1000, 0.05)
      last = now
      if (!advance(progress, dt, 0.001)) {
        el.style.mask = ''
        frame = 0
        onDone()
        return
      }
      const head = progress.x * (plot + EDGE)
      const axis = Math.max(0, el.clientWidth - plot)
      el.style.mask =
        `linear-gradient(to right, #000 ${head - EDGE}px, transparent ${head}px) 0 0 / ${plot}px 100% no-repeat, ` +
        `linear-gradient(#000, #000) right / ${axis}px 100% no-repeat`
    }
    frame = requestAnimationFrame(step)
  }
  let frame = requestAnimationFrame(step)

  return () => {
    cancelAnimationFrame(frame)
    el.style.mask = ''
  }
}
