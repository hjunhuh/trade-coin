import {
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  type ChartOptions,
  type DeepPartial,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'

export const COLORS = {
  up: '#22c55e',
  down: '#ef4444',
  upVol: 'rgba(34,197,94,0.25)',
  downVol: 'rgba(239,68,68,0.25)',
  upDim: 'rgba(34,197,94,0.22)',
  downDim: 'rgba(239,68,68,0.22)',
  text: '#71717a',
  grid: 'rgba(255,255,255,0.04)',
  ma20: '#eab308',
  ma60: '#8b5cf6',
  bb: 'rgba(148,163,184,0.45)',
  liq: '#fb923c',
}

export const toTime = (sec: number) => sec as UTCTimestamp

/**
 * Charts count time in UTC; these show it in the viewer's own time zone and language, with the
 * date only where the day changes.
 */
export function timeFormatters(locale: string) {
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, o)
  const hm = fmt({ hour: '2-digit', minute: '2-digit', hour12: false })
  const md = fmt({ month: 'short', day: 'numeric' })
  const ym = fmt({ year: 'numeric', month: 'short' })
  const y = fmt({ year: 'numeric' })
  const full = fmt({ year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  const date = (time: Time) => new Date((time as number) * 1000)
  return {
    tick: (time: Time, type: TickMarkType) => {
      const d = date(time)
      switch (type) {
        case TickMarkType.Year:
          return y.format(d)
        case TickMarkType.Month:
          return ym.format(d)
        case TickMarkType.DayOfMonth:
          return md.format(d)
        default:
          return hm.format(d)
      }
    },
    crosshair: (time: Time) => full.format(date(time)),
  }
}

export function chartOptions(locale: string, interactive: boolean): DeepPartial<ChartOptions> {
  const f = timeFormatters(locale)
  return {
    autoSize: true,
    handleScroll: interactive,
    handleScale: interactive,
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: COLORS.text,
      fontFamily: '"Geist Mono", ui-monospace, monospace',
      fontSize: 11,
      attributionLogo: false,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { color: COLORS.grid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: 'rgba(255,255,255,0.2)', style: LineStyle.Dashed, labelBackgroundColor: '#27272a' },
      horzLine: { color: 'rgba(255,255,255,0.2)', style: LineStyle.Dashed, labelBackgroundColor: '#27272a' },
    },
    rightPriceScale: { borderVisible: false },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 6,
      tickMarkFormatter: f.tick,
    },
    localization: {
      locale,
      timeFormatter: f.crosshair,
      priceFormatter: (p: number) => p.toFixed(2),
    },
  }
}
