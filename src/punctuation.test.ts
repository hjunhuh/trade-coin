// The site never shows a middle dot or an em dash: separate things with words, commas or space,
// and show a missing value as "-". This walks everything that ends up on the site (the app's
// source, its copy in both languages, index.html and the public files) and lists any it finds.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'

/** Written as escapes so this file passes its own check */
const FORBIDDEN = { '\u00B7': 'middle dot', '\u2014': 'em dash' } as const

const ROOT = path.join(__dirname, '..')
const TEXT = /\.(tsx?|css|html|txt|xml|svg|json)$/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    // Market data is binary and machine-written
    if (name === 'data' && dir.endsWith('public')) return []
    if (statSync(p).isDirectory()) return files(p)
    return TEXT.test(name) || name === '_headers' ? [p] : []
  })
}

it('has no middle dots or em dashes anywhere on the site', () => {
  const found: string[] = []
  for (const file of [...files(path.join(ROOT, 'src')), ...files(path.join(ROOT, 'public')), path.join(ROOT, 'index.html')]) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const [ch, name] of Object.entries(FORBIDDEN)) {
          if (line.includes(ch)) found.push(`${path.relative(ROOT, file)}:${i + 1} ${name}: ${line.trim()}`)
        }
      })
  }
  expect(found).toEqual([])
})
