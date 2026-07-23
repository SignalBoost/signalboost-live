import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/portable-products/product-registry.ts', import.meta.url), 'utf8')
test('portable product registry remains catalog-only and non-executing', () => {
  for (const forbidden of [/process\.env/, /\bfetch\s*\(/, /supabase/i, /readFile|writeFile|node:fs/, /child_process|exec\s*\(/, /playwright|puppeteer|browser\.launch/i, /checkout/i, /license activation/i, /cos tool/i, /worker/i, /api\//i, /=>/]) assert.doesNotMatch(source, forbidden)
  assert.doesNotMatch(source, /api[_-]?key|password|bearer\s|secret[_-]?key/i)
})
