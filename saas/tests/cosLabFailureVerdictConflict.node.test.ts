import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/20261006000200_lab_failure_verdict_one_per_job.sql', import.meta.url), 'utf8')
const service = readFileSync(new URL('../lib/ai/cos/cosLabFailureVerdictIngestion.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/internal/cos/university-independent-evaluator/failure-verdict/route.ts', import.meta.url), 'utf8')

test('atomic unique index rejects competing signed verdicts for the same provider job', () => {
  assert.match(migration, /create unique index if not exists/)
  assert.match(migration, /evidence->>'jobId'/)
  assert.match(migration, /where event_type = 'lab_failure_verdict'/)
})
test('conflicts fail closed without financial authority', () => {
  assert.match(service, /lab_verdict_duplicate_or_conflict_rejected/)
  assert.match(service, /financialAdjustmentAuthorized: false/)
  assert.match(route, /lab_verdict_duplicate_or_conflict_rejected' \? 409/)
})
