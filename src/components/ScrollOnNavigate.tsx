import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/** How far down each visited history entry was scrolled, for back and forward. */
const positions = new Map<string, number>()

/**
 * Page scroll across navigation, as with full page loads: a screen reached by a link opens at the
 * top, and back/forward return to where that screen was left. The browser's own restoring is off:
 * it runs while the previous screen is still showing, so it lands in the wrong place.
 */
export function ScrollOnNavigate() {
  const { key } = useLocation()
  const type = useNavigationType()
  const current = useRef(key)

  useLayoutEffect(() => {
    history.scrollRestoration = 'manual'
  }, [])

  // Before the new screen paints, so it never shows at the old screen's scroll
  useLayoutEffect(() => {
    current.current = key
    window.scrollTo(0, type === 'POP' ? (positions.get(key) ?? 0) : 0)
  }, [key, type])

  // Scroll events arrive after the switch above, so each is kept under the screen it belongs to
  useEffect(() => {
    const save = () => positions.set(current.current, window.scrollY)
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [])

  return null
}
