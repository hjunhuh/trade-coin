import { useEffect, useRef } from 'react'

type Handler = (e: KeyboardEvent) => void

/** Global key bindings, ignored while typing in form fields. Keys use KeyboardEvent.key, with "Shift+" prefix. */
export function useHotkeys(map: Record<string, Handler>, enabled = true) {
  const ref = useRef(map)
  ref.current = map

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[role="dialog"]')) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const combo = e.shiftKey && key !== ' ' ? `Shift+${key}` : key
      const handler = ref.current[combo]
      if (handler) {
        e.preventDefault()
        handler(e)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
