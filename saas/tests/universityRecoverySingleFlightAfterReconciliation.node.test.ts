import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const repair = readFileSync(new URL('../self-healing-host/university-distillation-autonomous-repair.ts', import.meta.url), 'utf8')

test('University repair checks persisted status after Builder stale reconciliation', () => {
  const reconcile = repair.indexOf('await reconcileStaleBuilderJobs({ userId, jobId })')
  const reread = repair.indexOf(".select('id,status').eq('id', jobId).eq('user_id', userId).maybeSingle()", reconcile)
  const active = repair.indexOf("['queued', 'running', 'paused'].includes(String(reconciled.status))", reread)
  const returnActive = repair.indexOf("return { disposition: 'already_active', jobId }", active)
  assert.ok(reconcile >= 0 && reread > reconcile && active > reread && returnActive > active)
  assert.match(repair, /if \(reconcileReadError\) throw new Error/)
})
