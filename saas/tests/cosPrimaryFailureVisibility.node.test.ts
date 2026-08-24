import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const LEGACY = readFileSync(new URL('../app/api/support/routeCoreLegacy.ts', import.meta.url), 'utf8')
const ROUTE_CORE = readFileSync(new URL('../app/api/support/routeCore.ts', import.meta.url), 'utf8')
const CONCIERGE = readFileSync(new URL('../app/api/concierge/route.ts', import.meta.url), 'utf8')
const LIVE = readFileSync(new URL('../lib/ai/cos/cosOrchestrationLive.ts', import.meta.url), 'utf8')
const BACKUP = readFileSync(new URL('../lib/cos-backup/runtime.ts', import.meta.url), 'utf8')

test('support routes preserve degraded error detail', () => {
  for (const source of [LEGACY, ROUTE_CORE]) {
    assert.match(source, /telemetry: \{ source: 'error-degraded', error_detail: detail \}/)
    assert.match(source, /error_detail: detail/)
  }
})
test('continuity preserves and reports primary failure detail', () => {
  assert.match(CONCIERGE, /errorDetail: String\(payload\?\.error_detail \|\| payload\?\.telemetry\?\.error_detail \|\| ''\)/)
  assert.match(LIVE, /Primary Failure Detail : \$\{String\(provenance\.primary_error_detail\)/)
})
test('backup output ceiling supports complete documents', () => {
  assert.match(BACKUP, /const BACKUP_MAX_TOKENS = 3000/)
  assert.equal(BACKUP.includes('maxTokens: 1200'), false)
  assert.match(BACKUP, /Deliver the thing that was asked for in this reply/)
})
