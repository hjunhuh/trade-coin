import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import { toTime } from '@/lib/chartTheme'

export interface TradeLabel {
  /** Open time (UTC seconds) of the candle the trade happened in */
  t: number
  /** Fill price: marked with a dot on the candle */
  price: number
  text: string
  /** Buys hang under the candle, sells sit above it */
  side: 'buy' | 'sell'
  color: string
  /** Text color on top of `color` */
  ink: string
}

type Target = Parameters<IPrimitivePaneRenderer['draw']>[0]
type Rect = { x0: number; x1: number; y0: number; y1: number }

const FONT = '600 10.5px Geist, "Pretendard Variable", system-ui, sans-serif'
const HEIGHT = 18
const PAD_X = 6
/** Space between the candle's wick and the label */
const GAP = 10

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/**
 * Draws a solid label for every trade just past the candle (under it for a buy, over it for a sell),
 * with a short stem to the candle and a dot at the exact fill price. Labels that would collide step outward.
 */
export class TradeLabels implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null
  private series: ISeriesApi<SeriesType, Time> | null = null
  private requestUpdate: (() => void) | null = null
  private labels: TradeLabel[] = []
  private extremes = new Map<number, { h: number; l: number }>()

  private readonly renderer: IPrimitivePaneRenderer = { draw: (target) => this.draw(target) }
  private readonly view: IPrimitivePaneView = { zOrder: () => 'top', renderer: () => this.renderer }

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
    this.chart = chart
    this.series = series
    this.requestUpdate = requestUpdate
  }

  detached() {
    this.chart = null
    this.series = null
    this.requestUpdate = null
  }

  paneViews() {
    return [this.view]
  }

  set(labels: TradeLabel[], bars: { t: number; h: number; l: number }[]) {
    this.labels = labels
    this.extremes = new Map(bars.map((b) => [b.t, { h: b.h, l: b.l }]))
    this.requestUpdate?.()
  }

  private draw(target: Target) {
    const { chart, series } = this
    if (!chart || !series || this.labels.length === 0) return
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.font = FONT
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const placed: Rect[] = []

      for (const label of this.labels) {
        const x = chart.timeScale().timeToCoordinate(toTime(label.t))
        const bar = this.extremes.get(label.t)
        if (x == null || !bar) continue
        const buy = label.side === 'buy'
        const edge = series.priceToCoordinate(buy ? bar.l : bar.h)
        if (edge == null) continue

        const width = Math.ceil(ctx.measureText(label.text).width) + PAD_X * 2
        const dir = buy ? 1 : -1
        let top = buy ? edge + GAP : edge - GAP - HEIGHT
        let rect = { x0: x - width / 2, x1: x + width / 2, y0: top, y1: top + HEIGHT }
        while (placed.some((p) => overlaps(p, rect))) {
          top += dir * (HEIGHT + 3)
          rect = { ...rect, y0: top, y1: top + HEIGHT }
        }
        placed.push(rect)

        // Stem from the wick to the label
        ctx.strokeStyle = label.color
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.55
        ctx.beginPath()
        ctx.moveTo(x, edge + dir * 2)
        ctx.lineTo(x, buy ? top : top + HEIGHT)
        ctx.stroke()
        ctx.globalAlpha = 1

        // Label
        ctx.fillStyle = label.color
        ctx.beginPath()
        ctx.roundRect(rect.x0, top, width, HEIGHT, 5)
        ctx.fill()
        ctx.fillStyle = label.ink
        ctx.fillText(label.text, x, top + HEIGHT / 2 + 0.5)

        // Fill price on the candle
        const fillY = series.priceToCoordinate(label.price)
        if (fillY != null) {
          ctx.beginPath()
          ctx.arc(x, fillY, 3, 0, Math.PI * 2)
          ctx.fillStyle = label.color
          ctx.fill()
          ctx.lineWidth = 1.5
          ctx.strokeStyle = '#09090b'
          ctx.stroke()
        }
      }
    })
  }
}
