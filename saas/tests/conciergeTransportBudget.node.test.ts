// saas/tests/conciergeTransportBudget.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const routeSource = readFileSync(resolve(here, '../app/api/concierge/route.ts'), 'utf8')
const clientSource = readFileSync(resolve(here, '../components/Concierge.tsx'), 'utf8')

function numericConstant(source: string, name: string): number {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9_]+)`))
  assert.ok(match, `${name} must remain an explicit numeric budget`)
  return Number(match[1].replaceAll('_', ''))
}

test('concierge primary timeout leaves material recovery margin inside Vercel maxDuration', () => {
  const primary = numericConstant(routeSource, 'PRIMARY_TIMEOUT_MS')
  const lifeline = numericConstant(routeSource, 'RESEARCH_LIFELINE_START_MS')
  const functionBudget = 300_000

  assert.ok(primary <= 150_000, `primary timeout ${primary}ms leaves too little recovery margin`)
  assert.ok(functionBudget - primary >= 120_000, 'reserve at least two minutes for bounded recovery and response serialization')
  assert.ok(lifeline < primary, 'research lifeline must start before primary timeout')
  assert.ok(primary - lifeline >= 20_000, 'research lifeline needs time to produce useful partial results before timeout')
})

test('public Concierge browser has a hard deadline and cannot spin indefinitely', () => {
  const primary = numericConstant(routeSource, 'PRIMARY_TIMEOUT_MS')
  const clientDeadline = numericConstant(clientSource, 'CONCIERGE_CLIENT_DEADLINE_MS')

  assert.ok(clientDeadline > primary, 'browser must leave time for server-side bounded recovery after the primary deadline')
  assert.ok(clientDeadline <= 240_000, `browser deadline ${clientDeadline}ms is too close to Vercel's 300s ceiling`)
  assert.match(clientSource, /const\s+requestAbortRef\s*=\s*useRef<AbortController\s*\|\s*null>\(null\)/)
  assert.match(clientSource, /const\s+controller\s*=\s*new\s+AbortController\(\)/)
  assert.match(clientSource, /signal:\s*controller\.signal/)
  assert.match(clientSource, /window\.setTimeout\(\(\)\s*=>\s*controller\.abort\(\),\s*CONCIERGE_CLIENT_DEADLINE_MS\)/)
  assert.match(clientSource, /requestAbortRef\.current\?\.abort\(\)/, 'Reset/unmount must cancel the active request')
  assert.match(clientSource, /requestAbortRef\.current\s*!==\s*controller/, 'stale aborted requests must not mutate a cleared or newer chat')
  assert.match(clientSource, /if\s*\(requestAbortRef\.current\s*===\s*controller\)[\s\S]*setLoading\(false\)/, 'an older request must not release loading state underneath a newer one')
})
