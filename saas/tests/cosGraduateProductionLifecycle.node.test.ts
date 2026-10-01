import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p:string) => readFileSync(new URL('../'+p, import.meta.url),'utf8')

test('graduate Production lifecycle is append-only, chained, sanitized, and covers post-graduation operations', () => {
  const migration=read('supabase/migrations/20261001233500_graduate_production_lifecycle_ledger.sql')
  assert.match(migration,/previous_event_hash/)
  assert.match(migration,/event_hash text not null unique/)
  assert.match(migration,/pg_advisory_xact_lock/)
  assert.match(migration,/digest\(/)
  for(const event of ['graduated','activated','serving_started','serving_succeeded','serving_failed','verified_outcome','health_observed','drift_detected','remediation_started','retraining_started','reevaluation_started','reactivated','rollback','retired']) assert.match(migration,new RegExp("'"+event+"'"))
  assert.doesNotMatch(migration,/raw_prompt|raw_response|prompt text|response text/i)
})

test('graduate serving attempts append lifecycle evidence for start, success, and failure',()=>{
  const source=read('lib/ai/cos/graduateServingAttempts.ts')
  assert.match(source,/append_cos_graduate_lifecycle_event/)
  assert.match(source,/'serving_started'/)
  assert.match(source,/'serving_succeeded'/)
  assert.match(source,/'serving_failed'/)
  assert.match(source,/authorityExpanded: false/)
  assert.match(source,/createHash\('sha256'\)/)
})
