import type { FeedStatus } from './types'

interface SocketOptions {
  url: string
  /** Sent right after each (re)connect, e.g. a subscribe message */
  onOpen?: (ws: WebSocket) => void
  onMessage: (data: unknown) => void
  onStatus: (status: FeedStatus) => void
  /** A connection that goes this long without a message is treated as dead and replaced */
  silenceMs?: number
}

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000]

/**
 * A WebSocket that keeps itself connected: it reconnects with backoff when the connection
 * drops or goes silent, and again as soon as the tab comes back to the foreground or the
 * device comes back online. Returns a stop function.
 */
export function keepConnected({ url, onOpen, onMessage, onStatus, silenceMs = 20000 }: SocketOptions): () => void {
  let ws: WebSocket | null = null
  let stopped = false
  let attempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let watchdog: ReturnType<typeof setInterval> | undefined
  let lastMessage = 0
  /** Whether the current connection has delivered a message yet */
  let live = false

  const clearTimers = () => {
    clearTimeout(retryTimer)
    clearInterval(watchdog)
  }

  const scheduleRetry = () => {
    if (stopped) return
    clearTimers()
    onStatus('reconnecting')
    const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
    attempt++
    retryTimer = setTimeout(connect, delay)
  }

  const drop = () => {
    const old = ws
    ws = null
    if (old) {
      old.onopen = old.onmessage = old.onerror = old.onclose = null
      try {
        old.close()
      } catch {
        /* already closed */
      }
    }
  }

  function connect() {
    if (stopped) return
    drop()
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch {
      scheduleRetry()
      return
    }
    ws = socket
    lastMessage = Date.now()
    socket.onopen = () => {
      onOpen?.(socket)
    }
    socket.onmessage = (e) => {
      lastMessage = Date.now()
      // The first message, not the open, is what proves the feed works
      if (!live) {
        attempt = 0
        live = true
        onStatus('live')
      }
      let data: unknown
      try {
        data = JSON.parse(e.data as string)
      } catch {
        return
      }
      onMessage(data)
    }
    socket.onerror = () => {
      /* onclose follows and schedules the retry */
    }
    socket.onclose = () => {
      if (ws !== socket) return
      live = false
      drop()
      scheduleRetry()
    }
    clearInterval(watchdog)
    watchdog = setInterval(() => {
      if (ws === socket && Date.now() - lastMessage > silenceMs) {
        live = false
        drop()
        scheduleRetry()
      }
    }, 2000)
  }

  // Phones suspend sockets in the background: check again the moment the page is visible
  const wake = () => {
    if (stopped || document.visibilityState !== 'visible') return
    if (!ws || Date.now() - lastMessage > 5000) {
      attempt = 0
      live = false
      connect()
    }
  }
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('online', wake)

  onStatus('connecting')
  connect()

  return () => {
    stopped = true
    clearTimers()
    drop()
    document.removeEventListener('visibilitychange', wake)
    window.removeEventListener('online', wake)
  }
}
