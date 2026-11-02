import { useLayoutEffect, useRef } from 'react'
import { advance, reducedMotion, spring, type Spring } from '@/lib/motion'
import { splitNumber, type NumberChar, type Section } from '@/lib/numberParts'
import { cn } from '@/lib/utils'

/**
 * A formatted number whose digits roll to each new value, odometer style.
 *
 * Every digit is a window over a 0–9 column. On a change the column rolls straight to the new
 * digit through the ones in between, up when it grows and down when it shrinks, and digits fade
 * out at the window's top and bottom edges. Characters that appear fade in where they land, a
 * new digit rolling up from 0; characters that go fade out where they were, a digit rolling back
 * to 0. The whole part holds on to its right edge and the decimals to their left, and each part
 * glides from where it was to where it now sits, so a number that grows or shrinks reflows
 * smoothly instead of jumping. Characters passing either end fade out there.
 *
 * With `from`, the first value rolls in from that text (the value at 0, say), so the number
 * counts up each time it appears. Later changes roll from the old value to the new one.
 *
 * With `trend`, every digit rolls the way the whole number moved, round past 9 to 0 like an
 * odometer: a counter going up keeps rolling up (8 → 9 → 0 → 1 → 2) instead of some digits
 * rolling back down. Suits a number that changes many times a second.
 *
 * Runs on springs stepped per frame and written straight to the DOM, so React doesn't re-render
 * while it moves. Shows the value at once when the viewer prefers reduced motion.
 */
export function RollingNumber({
  value,
  from,
  trend = false,
  className,
}: {
  value: string
  from?: string
  trend?: boolean
  className?: string
}) {
  const boxRef = useRef<HTMLSpanElement>(null)
  const rollerRef = useRef<Roller | null>(null)

  useLayoutEffect(() => {
    const roller = createRoller(boxRef.current!)
    rollerRef.current = roller
    return () => {
      roller.destroy()
      rollerRef.current = null
    }
  }, [])

  useLayoutEffect(() => {
    const roller = rollerRef.current!
    const animate = !reducedMotion()
    if (roller.blank && animate && from !== undefined && /\d/.test(value)) roller.set(from, false)
    roller.set(value, animate && !roller.blank, trend)
  }, [value, from, trend])

  return (
    <span className={cn('relative inline-block whitespace-nowrap', className)}>
      <span className="sr-only">{value}</span>
      <span ref={boxRef} aria-hidden className="relative inline-block" />
    </span>
  )
}

/** Characters fade in and out over this long, easing out */
const FADE_MS = 450

/** How far past each end characters stay visible while fading out there */
const EDGE = '0.5em'
/** A digit's window reaches this far above and below the digit's middle… */
const WINDOW = 0.6
/** …and fades out over this much at either end */
const WINDOW_FADE = '0.16em'
/**
 * A digit's column repeats 0–9 from row -REACH to row REACH + 9. Its target is kept within
 * 0–9 and its position within a cycle of the target, shifting both by whole cycles when needed
 * (the rows repeat, so nothing on screen changes); the extra row at each end shows past the edge.
 */
const REACH = 11

const fade = (dir: string, size: string) =>
  `linear-gradient(${dir}, transparent, #000 ${size}, #000 calc(100% - ${size}), transparent)`

/**
 * The moving characters sit in a box laid over a hidden copy of the plain text, which keeps the
 * page laid out exactly as if the number were plain text. The box reaches past the text by the
 * edge fade (and by enough above and below for the digit windows), and its sides glide from the
 * old text's ends to the new one's, so characters sliding in from where they were don't dim.
 */
const HOST_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  top: '-0.25em',
  bottom: '-0.25em',
  padding: `0.25em ${EDGE}`,
  whiteSpace: 'nowrap',
  maskImage: fade('to right', EDGE),
  webkitMaskImage: fade('to right', EDGE),
}

const SECTIONS: Section[] = ['pre', 'int', 'frac', 'post']
/** The edge each part holds on to while its characters change: the whole part grows leftward, the decimals rightward */
const ANCHOR: Record<Section, 'left' | 'right'> = { pre: 'right', int: 'right', frac: 'left', post: 'left' }

interface Glyph {
  part: NumberChar
  el: HTMLSpanElement
  /** Digits: the hidden digit that gives the cell its width, and the 0–9 column */
  sizer: HTMLSpanElement | null
  column: HTMLSpanElement | null
  /** Digits: which row of the column shows, fractional mid-roll */
  row: Spring
  opacity: number
  tween: { from: number; to: number; start: number } | null
  leaving: boolean
}

interface Part {
  section: Section
  el: HTMLSpanElement
  /** Horizontal offset from where the layout puts it, in px */
  x: Spring
  glyphs: Map<string, Glyph>
}

interface Roller {
  /** Nothing has been shown yet */
  readonly blank: boolean
  /** `trend`: roll every digit the way the number moved, round past 9 */
  set: (text: string, animate: boolean, trend?: boolean) => void
  destroy: () => void
}

/** CSS `ease-out`, cubic-bezier(0, 0, 0.58, 1) */
function easeOut(k: number) {
  const bez = (t: number, p1: number, p2: number) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3
  let lo = 0
  let hi = 1
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (bez(mid, 0, 0.58) < k) lo = mid
    else hi = mid
  }
  return bez((lo + hi) / 2, 0, 1)
}

function span(style: Partial<CSSStyleDeclaration>, text?: string) {
  const el = document.createElement('span')
  Object.assign(el.style, style)
  if (text !== undefined) el.textContent = text
  return el
}

/** The number a formatted text shows ("$1,234.5" → 1234.5), NaN for none */
const numeric = (text: string | null) => (text === null ? NaN : parseFloat(text.replace(/[^0-9.-]/g, '')))

/**
 * Points a digit's column at `digit`: straight there (`dir` 0), or round the way the number
 * moved (`dir` ±1), wrapping past 9. The target is kept within 0–9 and the position within a
 * cycle of it by shifting both by whole cycles, which looks the same since the rows repeat; a
 * column that has fallen more than a cycle behind (very fast changes) skips the cycles between.
 */
function aim(s: Spring, digit: number, dir: number) {
  const current = ((Math.round(s.target) % 10) + 10) % 10
  if (dir > 0) s.target += (digit - current + 10) % 10
  else if (dir < 0) s.target -= (current - digit + 10) % 10
  else s.target = digit
  const shift = Math.floor(s.target / 10) * 10
  s.target -= shift
  s.x -= shift
  while (s.x < s.target - 10) s.x += 10
  while (s.x > s.target + 10) s.x -= 10
}

function createGlyph(part: NumberChar, row: number): Glyph {
  if (part.digit === null) {
    const el = span({ display: 'inline-block', whiteSpace: 'pre' }, part.char)
    return { part, el, sizer: null, column: null, row: spring(0), opacity: 1, tween: null, leaving: false }
  }
  const el = span({ display: 'inline-block', position: 'relative' })
  const sizer = span({ visibility: 'hidden' }, part.char)
  // The window is centered on the line; one row of the column is 1em tall and sits in its middle
  const win = span({
    position: 'absolute',
    left: '0',
    right: '0',
    top: '50%',
    height: `${WINDOW * 2}em`,
    marginTop: `-${WINDOW}em`,
    maskImage: fade('to bottom', WINDOW_FADE),
    webkitMaskImage: fade('to bottom', WINDOW_FADE),
  })
  const column = span({
    position: 'absolute',
    left: '0',
    right: '0',
    top: `${WINDOW - 0.5}em`,
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'center',
  })
  for (let r = -REACH; r <= REACH + 9; r++) {
    column.append(span({ display: 'block', height: '1em', lineHeight: '1em' }, String(((r % 10) + 10) % 10)))
  }
  win.append(column)
  el.append(sizer, win)
  return { part, el, sizer, column, row: spring(row), opacity: 1, tween: null, leaving: false }
}

function createRoller(box: HTMLElement): Roller {
  const sizer = span({ visibility: 'hidden' })
  const host = span(HOST_STYLE)
  box.append(sizer, host)
  /** How far the box's left and right sides are from where the text now ends, in px */
  const left = spring(0)
  const right = spring(0)
  const parts: Part[] = SECTIONS.map((section) => {
    // Top-aligned so a part left empty still starts at the top of the line, where the
    // characters fading out of it are pinned
    const el = span({ display: 'inline-block', position: 'relative', verticalAlign: 'top' })
    host.append(el)
    return { section, el, x: spring(0), glyphs: new Map() }
  })
  const partOf = (section: Section) => parts[SECTIONS.indexOf(section)]
  let text: string | null = null
  let frame = 0
  let last = 0

  /** Where a part's anchored edge is on screen, shift included */
  const edge = (p: Part) => {
    const r = p.el.getBoundingClientRect()
    return ANCHOR[p.section] === 'left' ? r.left : r.right
  }

  const fadeTo = (g: Glyph, to: number, now: number) => {
    if (g.tween?.to === to) return
    g.tween = g.opacity === to ? null : { from: g.opacity, to, start: now }
  }

  function paint() {
    host.style.left = `calc(${left.x}px - ${EDGE})`
    host.style.right = `calc(${-right.x}px - ${EDGE})`
    for (const p of parts) {
      // The parts ride along with the box's left side, so take that back out
      const shift = p.x.x - left.x
      p.el.style.transform = shift ? `translateX(${shift}px)` : ''
      for (const g of p.glyphs.values()) {
        if (g.column) g.column.style.transform = `translateY(${-(g.row.x + REACH)}em)`
        g.el.style.opacity = g.opacity === 1 ? '' : String(g.opacity)
      }
    }
  }

  function tick(now: number) {
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05))
    last = now
    let busy = advance(left, dt, 0.05)
    busy = advance(right, dt, 0.05) || busy
    for (const p of parts) {
      busy = advance(p.x, dt, 0.05) || busy
      for (const g of [...p.glyphs.values()]) {
        if (g.column) busy = advance(g.row, dt, 0.002) || busy
        if (!g.tween) continue
        const k = Math.max(0, Math.min(1, (now - g.tween.start) / FADE_MS))
        g.opacity = g.tween.from + (g.tween.to - g.tween.from) * easeOut(k)
        if (k < 1) {
          busy = true
        } else {
          g.tween = null
          if (g.leaving) {
            g.el.remove()
            p.glyphs.delete(g.part.key)
          }
        }
      }
    }
    paint()
    frame = busy ? requestAnimationFrame(tick) : 0
  }

  function setAtRest(textNext: string, next: NumberChar[]) {
    sizer.textContent = textNext
    left.x = left.target = left.v = 0
    right.x = right.target = right.v = 0
    for (const p of parts) {
      p.el.replaceChildren()
      p.glyphs.clear()
      p.x = spring(0)
    }
    for (const part of next) {
      const p = partOf(part.section)
      const g = createGlyph(part, part.digit ?? 0)
      p.glyphs.set(part.key, g)
      p.el.append(g.el)
    }
    paint()
  }

  function setAnimated(textNext: string, next: NumberChar[], dir: number) {
    const now = performance.now()
    const hostBefore = host.getBoundingClientRect()
    const before = parts.map(edge)

    // Characters that go: pin each where it is, measured from its part's anchored edge (all
    // measured before any of them leaves the flow), then fade it out, a digit rolling to 0
    const keep = new Set(next.map((n) => n.key))
    const going: [Part, Glyph, number][] = []
    for (const p of parts) {
      const outer = p.el.getBoundingClientRect()
      for (const g of p.glyphs.values()) {
        if (g.leaving || keep.has(g.part.key)) continue
        const r = g.el.getBoundingClientRect()
        going.push([p, g, ANCHOR[p.section] === 'left' ? r.left - outer.left : outer.right - r.right])
      }
    }
    for (const [p, g, offset] of going) {
      g.leaving = true
      Object.assign(g.el.style, { position: 'absolute', top: '0', [ANCHOR[p.section]]: `${offset}px` })
      g.row.target = 0
      fadeTo(g, 0, now)
      // Never got to show: nothing to fade
      if (!g.tween) {
        g.el.remove()
        p.glyphs.delete(g.part.key)
      }
    }

    sizer.textContent = textNext

    // Characters that stay take their new digit; new ones fade in, a digit rolling up from 0
    for (const part of next) {
      const p = partOf(part.section)
      let g = p.glyphs.get(part.key)
      if (!g) {
        g = createGlyph(part, 0)
        g.opacity = 0
        p.glyphs.set(part.key, g)
      } else if (g.leaving) {
        g.leaving = false
        Object.assign(g.el.style, { position: '', top: '', left: '', right: '' })
      }
      g.part = part
      if (g.sizer && part.digit !== null) {
        g.sizer.textContent = part.char
        aim(g.row, part.digit, dir)
      }
      fadeTo(g, 1, now)
      p.el.append(g.el)
    }

    // The box's sides and each part start from where they were on screen and glide to their
    // new places. Everything measured now still carries the shifts painted last frame.
    const hostAfter = host.getBoundingClientRect()
    left.x = hostBefore.left - (hostAfter.left - left.x)
    right.x = hostBefore.right - (hostAfter.right - right.x)
    parts.forEach((p, i) => {
      p.x.x = before[i] - (edge(p) - p.x.x)
    })

    paint()
    if (!frame) {
      last = now
      frame = requestAnimationFrame(tick)
    }
  }

  return {
    get blank() {
      return text === null
    },
    set(next, animate, trend = false) {
      if (next === text) return
      const prev = text
      text = next
      if (!animate) return setAtRest(next, splitNumber(next))
      const delta = numeric(next) - numeric(prev)
      setAnimated(next, splitNumber(next), trend && Number.isFinite(delta) ? Math.sign(delta) : 0)
    },
    destroy() {
      cancelAnimationFrame(frame)
      box.replaceChildren()
    },
  }
}
