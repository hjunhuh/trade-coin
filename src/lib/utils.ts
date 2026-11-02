import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** A fresh random id (works without a secure context too, e.g. on a LAN address) */
export function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
}
