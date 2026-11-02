import type { Bar } from './types'

/**
 * Fetches one page: up to `n` candles, oldest first. With `start` the page begins there;
 * without it the page holds the latest `n` candles that open at or before `end`.
 */
export type PageFetcher = (start: number | undefined, end: number, n: number) => Promise<Bar[]>

/** Most pages a single request may take, so a long gap can't turn into hundreds of calls. */
const MAX_PAGES = 12

/**
 * Collects up to `limit` candles across pages. Forward from `start` when given, otherwise
 * backward from `end`. The result is oldest first, without duplicates.
 */
export async function collect(
  fetchPage: PageFetcher,
  perPage: number,
  intervalSec: number,
  opts: { start?: number; end?: number; limit: number },
): Promise<Bar[]> {
  const end = opts.end ?? Math.floor(Date.now() / 1000)
  const byTime = new Map<number, Bar>()
  const left = () => opts.limit - byTime.size

  if (opts.start != null) {
    let cursor = opts.start
    for (let i = 0; i < MAX_PAGES && left() > 0 && cursor <= end; i++) {
      const page = await fetchPage(cursor, end, Math.min(perPage, left()))
      for (const b of page) if (b.t >= opts.start && b.t <= end) byTime.set(b.t, b)
      const last = page.at(-1)
      if (!last || last.t < cursor) break
      cursor = last.t + intervalSec
    }
  } else {
    let cursor = end
    for (let i = 0; i < MAX_PAGES && left() > 0; i++) {
      const n = Math.min(perPage, left())
      const page = await fetchPage(undefined, cursor, n)
      for (const b of page) if (b.t <= end) byTime.set(b.t, b)
      const first = page[0]
      if (!first || page.length < n) break
      cursor = first.t - 1
    }
  }

  const bars = [...byTime.values()].sort((a, b) => a.t - b.t)
  // Backward collection keeps the newest `limit`; forward keeps the oldest
  return opts.start != null ? bars.slice(0, opts.limit) : bars.slice(-opts.limit)
}

/** fetch() that turns network failures and bad statuses into one kind of error. */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return (await res.json()) as T
}
