import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

const generatedCopyUrl = new URL('../../lib/i18n/generatedUiCopy.ts', import.meta.url)
let cachedCopy = null

function loadCopy() {
  if (cachedCopy) return cachedCopy
  const source = readFileSync(generatedCopyUrl, 'utf8')
  const copy = new Map()
  const row = /^\s*("u_[a-f0-9]+"):\s*("(?:[^"\\]|\\.)*"),?\s*$/gm
  for (const match of source.matchAll(row)) copy.set(JSON.parse(match[1]), JSON.parse(match[2]))
  cachedCopy = copy
  return copy
}

function quote(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`
}

export function hydrateUiCopy(source) {
  const copy = loadCopy()
  return source.replace(/uiCopy\(\s*(['"])(u_[a-f0-9]+)\1\s*\)/g, (call, _quote, key) => {
    const value = copy.get(key)
    return value === undefined ? call : quote(value)
  })
}

export function readUiSource(url) {
  return hydrateUiCopy(readFileSync(url, 'utf8'))
}

export async function readUiSourceAsync(url) {
  return hydrateUiCopy(await readFile(url, 'utf8'))
}
