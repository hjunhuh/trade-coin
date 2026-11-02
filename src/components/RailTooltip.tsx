import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * One tooltip shared by every item of the side rail.
 *
 * It's a window over a column of all the labels. Moving between items glides the window to the
 * new item while the column scrolls a row per item, so the text rolls through the labels in
 * between, and the window's width eases from one label's width to the next. While an item is
 * hovered the window leans a little toward the pointer. It grows out at the pointer's height when
 * it appears, and follows the pointer out, shrinking and fading, when the pointer leaves the rail.
 * It never crosses over the rail itself: passing over a button would darken it for a moment.
 *
 * It also decides which item looks hovered (`data-hovered`), instead of the browser's :hover:
 * an item lights up once the pointer slows down or stops on it, and the previous one stays lit
 * until then. Items the pointer sweeps past on the way don't flash, and moving to a neighbour
 * hands the highlight over without a gap.
 *
 * Everything runs on springs stepped per frame and written straight to the DOM, so React doesn't
 * re-render while it moves.
 */

interface Spring {
  x: number
  v: number
  target: number
}
interface SpringConfig {
  stiffness: number
  damping: number
}

const spring = (x: number): Spring => ({ x, v: 0, target: x })

/** Moving between items: settles in about 300ms without overshooting. */
const GLIDE: SpringConfig = { stiffness: 320, damping: 34 }
/** Appearing: fades and grows in over about 170ms. */
const APPEAR: SpringConfig = { stiffness: 520, damping: 46 }
/** Leaving: mostly gone after about 130ms. */
const VANISH: SpringConfig = { stiffness: 900, damping: 60 }

/** Height of one label row, and of the window */
const ROW = 28
/** Space between the rail and the window */
const GAP = 10
/** How far the window leans toward the pointer within the hovered item, along the rail */
const PULL = 0.25
/** The highlight moves to an item once the pointer has been on it this long and is moving slowly… */
const MIN_DWELL = 40
/** …slower than this (px/ms), or has stopped for this long, */
const SLOW = 0.25
const STILL = 40
/** …or has simply stayed on it this long. */
const MAX_DWELL = 160
/** Size the window grows from, and shrinks to on the way out */
const SCALE_FROM = 0.5
const SCALE_OUT = 0.7

function stepSpring(s: Spring, { stiffness, damping }: SpringConfig, dt: number) {
  s.v += (stiffness * (s.target - s.x) - damping * s.v) * dt
  s.x += s.v * dt
}

/** At rest: snaps the last fraction onto the target so nothing keeps drifting. */
function settle(s: Spring, eps: number) {
  if (Math.abs(s.target - s.x) > eps || Math.abs(s.v) > eps) return false
  s.x = s.target
  s.v = 0
  return true
}

/** Position along the rail in items: 1.5 is halfway between the second and third item. */
function indexAt(y: number, centers: number[]) {
  const n = centers.length
  if (n < 2) return 0
  let i = 0
  while (i < n - 2 && y > centers[i + 1]) i++
  const f = i + (y - centers[i]) / (centers[i + 1] - centers[i])
  // Past either end the text rolls on into blank space as it fades
  return Math.min(Math.max(f, -1), n)
}

const nearest = (y: number, centers: number[]) =>
  centers.reduce((best, c, i) => (Math.abs(y - c) < Math.abs(y - centers[best]) ? i : best), 0)

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

interface RailTooltipProps {
  navRef: RefObject<HTMLElement | null>
  /** The rail's items, top to bottom, in the same order as `labels` */
  itemRefs: RefObject<(HTMLElement | null)[]>
  labels: string[]
  /** Hidden while something else on the rail is open (the language menu) */
  suppressed: boolean
}

export function RailTooltip({ navRef, itemRefs, labels, suppressed }: RailTooltipProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const anim = useRef({
    y: spring(0),
    x: spring(0),
    f: spring(0),
    opacity: spring(0),
    scale: spring(SCALE_FROM),
    mode: 'hidden' as 'hidden' | 'shown' | 'leaving',
    shownBefore: false,
    widths: [] as number[],
    frame: 0,
    last: 0,
  })
  // Event handlers live for the rail's lifetime; they read these instead of stale props
  const suppressedRef = useRef(suppressed)
  const api = useRef<{ hide: () => void; paint: () => void } | null>(null)

  // Each label's own width, so the window can ease between them
  const labelKey = labels.join('\n')
  useLayoutEffect(() => {
    const measure = () => {
      const rows = columnRef.current?.children
      if (!rows) return
      anim.current.widths = Array.from(rows, (row) => (row as HTMLElement).offsetWidth)
      api.current?.paint()
    }
    measure()
    let live = true
    void document.fonts?.ready.then(() => live && measure())
    return () => {
      live = false
    }
  }, [labelKey])

  useEffect(() => {
    suppressedRef.current = suppressed
    if (suppressed) api.current?.hide()
  }, [suppressed])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const a = anim.current

    /** Rail measurements in the window's own coordinates (y from the top of the rail's inside). */
    const geometry = () => {
      const r = nav.getBoundingClientRect()
      const top = r.top + nav.clientTop
      const left = r.left + nav.clientLeft + nav.clientWidth + GAP
      const centers = (itemRefs.current ?? []).flatMap((el) => {
        if (!el) return []
        const b = el.getBoundingClientRect()
        return [b.top + b.height / 2 - top]
      })
      return { top, left, centers }
    }

    const paint = () => {
      const box = boxRef.current
      const column = columnRef.current
      const w = a.widths
      if (!box || !column || w.length === 0) return
      const fi = Math.min(Math.max(a.f.x, 0), w.length - 1)
      const lo = Math.floor(fi)
      const hi = Math.min(lo + 1, w.length - 1)
      box.style.width = `${w[lo] + (w[hi] - w[lo]) * (fi - lo)}px`
      box.style.opacity = String(Math.min(Math.max(a.opacity.x, 0), 1))
      box.style.transform = `translate3d(${a.x.x}px, ${a.y.x - ROW / 2}px, 0) scale(${a.scale.x})`
      column.style.transform = `translate3d(0, ${-a.f.x * ROW}px, 0)`
    }

    const tick = (now: number) => {
      const dt = Math.min((now - a.last) / 1000, 1 / 30)
      a.last = now
      const presence = a.mode === 'leaving' ? VANISH : APPEAR
      // Small fixed steps keep the stiff springs stable on slow frames
      const steps = Math.max(1, Math.ceil(dt * 240))
      for (let i = 0; i < steps; i++) {
        stepSpring(a.y, GLIDE, dt / steps)
        stepSpring(a.x, GLIDE, dt / steps)
        stepSpring(a.f, GLIDE, dt / steps)
        stepSpring(a.opacity, presence, dt / steps)
        stepSpring(a.scale, presence, dt / steps)
      }
      if (a.mode === 'leaving' && a.opacity.x < 0.02) finishLeaving()
      paint()
      const resting = [
        settle(a.y, 0.05),
        settle(a.x, 0.05),
        settle(a.f, 0.002),
        settle(a.opacity, 0.002),
        settle(a.scale, 0.002),
      ].every(Boolean)
      a.frame = resting && a.mode !== 'leaving' ? 0 : requestAnimationFrame(tick)
    }

    const kick = () => {
      if (reducedMotion()) {
        for (const s of [a.y, a.x, a.f, a.opacity, a.scale]) Object.assign(s, { x: s.target, v: 0 })
        if (a.mode === 'leaving') finishLeaving()
        paint()
        return
      }
      if (a.frame) return
      a.last = performance.now()
      a.frame = requestAnimationFrame(tick)
    }

    /** Point at item `i`; `py` is where the pointer is along the rail, if it's a pointer. */
    const aim = (i: number, centers: number[], py = centers[i]) => {
      a.y.target = centers[i] + PULL * (py - centers[i])
      a.x.target = 0
      a.f.target = i
      a.opacity.target = 1
      a.scale.target = 1
    }

    /** Come in from (x, y); the text rolls in from wherever it was last. */
    const appear = (i: number, x: number, y: number) => {
      if (a.mode === 'hidden') {
        // Start beside the rail even when the pointer is over a button, so it never covers one
        Object.assign(a.x, { x: Math.max(x, 0), v: 0 })
        Object.assign(a.y, { x: y, v: 0 })
        Object.assign(a.scale, { x: SCALE_FROM, v: 0 })
        // The very first time there's nothing to roll from, so roll in from the row above
        if (!a.shownBefore) Object.assign(a.f, { x: i - 1, v: 0 })
      }
      a.mode = 'shown'
      a.shownBefore = true
    }

    // Leaving with the pointer: keep following it out while fading
    let followPointer = false
    const follow = (clientX: number, clientY: number) => {
      const g = geometry()
      const py = clientY - g.top
      // Out to the right with the pointer, but never back over the rail
      a.x.target = Math.max(clientX - g.left, 0)
      a.y.target = py
      a.f.target = indexAt(py, g.centers)
    }
    const onWindowMove = (e: PointerEvent) => {
      if (!followPointer) return
      follow(e.clientX, e.clientY)
      kick()
    }
    const stopFollowing = () => {
      followPointer = false
      window.removeEventListener('pointermove', onWindowMove)
    }
    const finishLeaving = () => {
      a.mode = 'hidden'
      Object.assign(a.opacity, { x: 0, v: 0, target: 0 })
      stopFollowing()
    }
    // Which item looks hovered
    let lit = -1
    let pending = -1
    let pendingSince = 0
    let dwell = 0
    let speed = 0
    let lastMove: { x: number; y: number; t: number } | null = null
    const light = (i: number) => {
      window.clearTimeout(dwell)
      pending = -1
      if (i === lit) return
      const els = itemRefs.current ?? []
      if (lit >= 0) els[lit]?.removeAttribute('data-hovered')
      if (i >= 0) els[i]?.setAttribute('data-hovered', '')
      lit = i
    }
    const lightWhenSettled = (i: number, e: PointerEvent) => {
      const now = e.timeStamp
      if (lastMove && now > lastMove.t) {
        const v = Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y) / (now - lastMove.t)
        speed = speed * 0.5 + v * 0.5
      }
      lastMove = { x: e.clientX, y: e.clientY, t: now }
      // Back on the lit item, or the first item after coming onto the rail: right away
      if (i === lit || lit < 0) return light(i)
      if (i !== pending) {
        pending = i
        pendingSince = now
      }
      const stayed = now - pendingSince
      if (stayed >= MAX_DWELL || (stayed >= MIN_DWELL && speed < SLOW)) return light(i)
      // If the pointer stops here, no more moves arrive: light it once it has been still a moment
      window.clearTimeout(dwell)
      dwell = window.setTimeout(() => light(i), Math.max(MIN_DWELL - stayed, STILL))
    }

    const leave = (withPointer?: { x: number; y: number }) => {
      light(-1)
      lastMove = null
      speed = 0
      if (a.mode !== 'shown') return
      a.mode = 'leaving'
      a.opacity.target = 0
      a.scale.target = SCALE_OUT
      if (withPointer && !reducedMotion()) {
        follow(withPointer.x, withPointer.y)
        followPointer = true
        window.addEventListener('pointermove', onWindowMove)
      }
      kick()
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || suppressedRef.current) return
      const g = geometry()
      if (g.centers.length === 0) return
      const py = e.clientY - g.top
      const i = nearest(py, g.centers)
      lightWhenSettled(i, e)
      stopFollowing()
      appear(i, e.clientX - g.left, py)
      aim(i, g.centers, py)
      kick()
    }
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      leave({ x: e.clientX, y: e.clientY })
    }

    // Keyboard: show the label of the item that has visible focus
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement
      const i = (itemRefs.current ?? []).indexOf(el)
      if (i < 0 || suppressedRef.current || !el.matches(':focus-visible')) return
      const g = geometry()
      light(i)
      stopFollowing()
      appear(i, 0, g.centers[i])
      aim(i, g.centers)
      kick()
    }
    const onFocusOut = (e: FocusEvent) => {
      if (!nav.contains(e.relatedTarget as Node | null)) leave()
    }

    api.current = { hide: () => leave(), paint }
    nav.addEventListener('pointermove', onMove)
    nav.addEventListener('pointerleave', onLeave)
    nav.addEventListener('focusin', onFocusIn)
    nav.addEventListener('focusout', onFocusOut)
    paint()
    return () => {
      nav.removeEventListener('pointermove', onMove)
      nav.removeEventListener('pointerleave', onLeave)
      nav.removeEventListener('focusin', onFocusIn)
      nav.removeEventListener('focusout', onFocusOut)
      stopFollowing()
      light(-1)
      cancelAnimationFrame(a.frame)
      a.frame = 0
      api.current = null
    }
  }, [navRef, itemRefs])

  return (
    <div
      ref={boxRef}
      aria-hidden
      className="pointer-events-none absolute top-0 left-full ml-2.5 h-7 origin-left overflow-hidden rounded-lg bg-popover text-popover-foreground opacity-0 shadow-lg ring-1 shadow-black/40 ring-white/8 will-change-transform"
    >
      <div ref={columnRef} className="flex flex-col items-start will-change-transform">
        {labels.map((label, i) => (
          <div key={i} className="flex h-7 shrink-0 items-center px-2.5 text-xs font-medium whitespace-nowrap">
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
