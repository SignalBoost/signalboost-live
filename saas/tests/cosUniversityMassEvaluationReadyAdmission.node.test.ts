import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const consumer=fs.readFileSync('lib/ai/cos/cosUniversityMassDistillationConsumer.ts','utf8')
const route=fs.readFileSync('app/api/cron/cos-university-mass-distilled-evaluation/route.ts','utf8')
const migration=fs.readFileSync('supabase/migrations/20261001113000_mass_evaluation_ready_admission.sql','utf8')

test('training completion stages qualified mass artifacts outside pending',()=>{
  assert.match(consumer,/status: 'evaluation_ready'/)
  assert.match(consumer,/nextGate: 'evaluation_admission'/)
})

test('rolling evaluator considers ready work and promotes only after approval',()=>{
  assert.match(route,/\.in\('status', \['evaluation_ready', 'evaluation_pending'\]\)/)
  const approval=route.indexOf("claim: 'mass_distilled_independent_evaluation_approved'")
  const admission=route.indexOf(".update({ status: 'evaluation_pending'")
  assert.ok(approval>=0)
  assert.ok(admission>approval)
  assert.match(route,/\.eq\('status', 'evaluation_ready'\)/)
})

test('database pending boundary requires a live exact evaluator approval',()=>{
  assert.match(migration,/mass_distilled_independent_evaluation_approved/)
  assert.match(migration,/lower\(coalesce\(e\.evidence->>'artifactHash',''\)\) = lower\(new\.trained_artifact_hash\)/)
  assert.match(migration,/e\.expires_at > now\(\)/)
  assert.match(migration,/mass_artifact_evaluation_admission_approval_missing/)
})
