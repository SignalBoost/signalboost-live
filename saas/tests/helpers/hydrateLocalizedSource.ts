import { readFileSync } from 'node:fs'

const generatedCopyUrl = new URL('../../lib/i18n/generatedUiCopy.ts', import.meta.url)
let generatedCopy: ReadonlyMap<string, string> | null = null

function loadGeneratedCopy(): ReadonlyMap<string, string> {
  if (generatedCopy) return generatedCopy

  const source = readFileSync(generatedCopyUrl, 'utf8')
  const entries = new Map<string, string>()
  const row = /^\s*("u_[^"]+"):\s*("(?:\\.|[^"\\])*")\s*,\s*$/gm

  for (const match of source.matchAll(row)) {
    entries.set(JSON.parse(match[1]) as string, JSON.parse(match[2]) as string)
  }

  if (entries.size === 0) throw new Error('Generated UI copy table could not be parsed')
  generatedCopy = entries
  return generatedCopy
}

function asSingleQuotedLiteral(value: string): string {
  return `'${value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')}'`
}

/**
 * Source-inspection tests assert product behavior, not where English is stored.
 * Resolve uiCopy() references back to equivalent string literals so assertions
 * inspect the effective copy for that specific source file.
 */
export function hydrateLocalizedSource(source: string): string {
  const copy = loadGeneratedCopy()
  return source.replace(
    /uiCopy\(\s*(['"])(u_[a-f0-9]+)\1\s*\)/g,
    (call, _quote: string, key: string) => {
      const value = copy.get(key)
      return value === undefined ? call : asSingleQuotedLiteral(value)
    },
  )
}
