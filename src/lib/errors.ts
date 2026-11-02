import type { TFunction } from 'i18next'

/**
 * A failure with a stable code, shown as the translation of `error.<code>`. The bank and game
 * rules throw it, and so does the market data download ("unreachable" when a file can't be
 * fetched, "data_changed" when the data no longer has what a game needs).
 */
export class AppError extends Error {
  code: string
  /** HTTP-like status: 0 for a download that failed, 400, 404 or 409 for a broken rule */
  status: number
  constructor(code: string, message: string = code, status = 400) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
  }
}

/** Translated message for an error's code. */
export function errorText(t: TFunction, err: unknown): string {
  const code = err instanceof AppError ? err.code : 'generic'
  return t(`error.${code}`, { defaultValue: t('error.generic') })
}
