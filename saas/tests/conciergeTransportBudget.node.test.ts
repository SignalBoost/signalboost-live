// saas/tests/conciergeTransportBudget.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, '../app/api/concierge/route.ts'), 'utf8')

function numericConstant(name: string): number {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9_]+)`))
  assert.ok(match, `${name} must remain an explicit numeric budget`)
  return Number(match[1].replaceAll('_', ''))
}

test('concierge primary timeout leaves material recovery margin inside Vercel maxDuration', () => {
  const primary = numericConstant('PRIMARY_TIMEOUT_MS')
  const lifeline = numericConstant('RESEARCH_LIFELINE_START_MS')
  const functionBudget = 300_000

  assert.ok(primary <= 150_000, `primary timeout ${primary}ms leaves too little recovery margin`)
  assert.ok(functionBudget - primary >= 120_000, 'reserve at least two minutes for bounded recovery and response serialization')
  assert.ok(lifeline < primary, 'research lifeline must start before primary timeout')
  assert.ok(primary - lifeline >= 20_000, 'research lifeline needs time to produce useful partial results before timeout')
})
