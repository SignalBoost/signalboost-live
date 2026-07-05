#!/usr/bin/env node
// Lightweight scanner for visible hardcoded UI copy in TS/TSX files.
// It intentionally ignores locale dictionaries, docs, tests, and comments.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const includeExt = new Set(['.ts', '.tsx'])
const skipParts = [
  'node_modules', '.next', '.git', 'dist', 'build', 'coverage',
  'lib/i18n', 'locales', 'docs', 'tests', 'scripts', 'supabase/migrations',
]

function extname(path) {
  const i = path.lastIndexOf('.')
  return i >= 0 ? path.slice(i) : ''
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const rel = relative(root, full)
    if (skipParts.some(part => rel.includes(part))) continue
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (includeExt.has(extname(full))) out.push(full)
  }
  return out
}

const visiblePattern = />([^<{}`]+[A-Za-z][^<{}`]*)<|placeholder=["']([^"']*[A-Za-z][^"']*)["']|aria-label=["']([^"']*[A-Za-z][^"']*)["']/g
const allow = [/^[A-Z0-9_ -]+$/, /^https?:/, /^[a-z0-9._/-]+$/i]
const hits = []

for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8')
  let match
  while ((match = visiblePattern.exec(text))) {
    const value = (match[1] || match[2] || match[3] || '').trim()
    if (!value) continue
    if (allow.some(r => r.test(value))) continue
    const line = text.slice(0, match.index).split('\n').length
    hits.push(`${relative(root, file)}:${line}: ${value}`)
  }
}

if (hits.length) {
  console.error('Hardcoded visible UI copy found. Move these strings into i18n dictionaries:')
  for (const hit of hits.slice(0, 250)) console.error(' - ' + hit)
  if (hits.length > 250) console.error(` - ...and ${hits.length - 250} more`)
  process.exit(1)
}

console.log('No hardcoded visible UI copy found by scanner.')
