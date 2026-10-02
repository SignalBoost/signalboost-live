// saas/tests/cosWorkforceAbandonedAssignments.node.test.ts
//
// Production 2026-10-02: 12 of 16 on-call graduates showed WORKING. An assignment opened 'working' whose process ended
// before the closing write stays WORKING forever. The Workforce cron must close such work as runtime_failed
// (infrastructure, never competence) and must not start graduate calls it cannot finish before its own deadline.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('abandoned open assignments are closed as runtime_failed, never as a competence verdict', () => {
  const src = read('lib/ai/cos/cosWorkforceAssignments.ts')
  const fn = src.slice(src.indexOf('export async function closeAbandonedWorkforceAssignments'))
  assert.match(src, /WORKFORCE_ASSIGNMENT_MAX_OPEN_MS = 10 \* 60_000/)
  assert.match(fn, /status: 'runtime_failed', failure_reason: 'no_terminal_recorded'/)
  assert.match(fn, /\.in\('status', \['assigned', 'working'\]\)\s+\.lt\('started_at', cutoff\)/)
  assert.match(fn, /\.is\('started_at', null\)\s+\.lt\('assigned_at', cutoff\)/)
  assert.doesNotMatch(fn, /'remediation'|'verified'|\.delete\(/)
})

test('the Workforce cron closes abandoned work first and never starts a call it cannot finish', () => {
  const route = read('app/api/cron/cos-workforce-pipeline/route.ts')
  const close = route.indexOf('closeAbandonedWorkforceAssignments()')
  const verify = route.indexOf('verifyServedWorkforceAssignments()')
  assert.ok(close > 0 && verify > close, 'close abandoned work before anything else')
  assert.match(route, /export const maxDuration = 60\nconst RUN_BUDGET_MS = 50_000/)
  assert.match(route, /const shadowTimeoutMs = Math\.min\(SHADOW_MAX_MS, deadline - Date\.now\(\) - SHADOW_CLOSE_MARGIN_MS\)\s+if \(shadowTimeoutMs < 5_000\) break/)
  assert.match(route, /timeoutMs: shadowTimeoutMs,/)
  assert.match(route, /abandonedAssignmentsClosed: abandoned\.closed/)
})
// end of saas/tests/cosWorkforceAbandonedAssignments.node.test.ts (if this line is missing, the paste was cut short)
