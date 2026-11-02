/** A value pulled toward `target` by a spring, stepped per frame */
export interface Spring {
  x: number
  v: number
  target: number
}

export const spring = (x: number): Spring => ({ x, v: 0, target: x })

/**
 * The account page's motion: numbers rolling, the balance chart drawing in. Matched to the
 * NumberFlow reference clip: 30% of the way at 100ms, 80% at 300ms, settled by 900ms, no overshoot.
 */
const STIFFNESS = 125
const DAMPING = 25.5
/** Step size, small enough to stay accurate on a slow frame */
const STEP = 1 / 240

/** Steps a spring by `dt` seconds; false once it has come to rest within `eps` */
export function advance(s: Spring, dt: number, eps: number) {
  if (s.x === s.target && s.v === 0) return false
  for (let t = dt; t > 0; t -= STEP) {
    const h = Math.min(STEP, t)
    s.v += (STIFFNESS * (s.target - s.x) - DAMPING * s.v) * h
    s.x += s.v * h
  }
  if (Math.abs(s.target - s.x) > eps || Math.abs(s.v) > eps * 10) return true
  s.x = s.target
  s.v = 0
  return false
}

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
