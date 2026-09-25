// saas/tests/cosUniversityMassBacklogCompactor.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MASS_BACKLOG_COMPACTOR_DEFAULT_LIMIT,
  MASS_BACKLOG_COMPACTOR_MAX_LIMIT,
  MASS_BACKLOG_COMPACTOR_RPC,
  massBacklogCompactorLimit,
} from '../lib/ai/cos/cosUniversityMassBacklogCompactor.ts'

const migration=readFileSync(new URL('../supabase/migrations/20260925010000_mass_distilled_backlog_compactor.sql',import.meta.url),'utf8')
const route=readFileSync(new URL('../app/api/cron/cos-university-mass-backlog-compact/route.ts',import.meta.url),'utf8')
const vercel=readFileSync(new URL('../vercel.json',import.meta.url),'utf8')

test('compactor limit is bounded and owner-tunable',()=>{
  assert.equal(MASS_BACKLOG_COMPACTOR_DEFAULT_LIMIT,50)
  assert.equal(MASS_BACKLOG_COMPACTOR_MAX_LIMIT,200)
  assert.equal(massBacklogCompactorLimit({}),50)
  assert.equal(massBacklogCompactorLimit({COS_UNIVERSITY_MASS_BACKLOG_COMPACTOR_MAX_PER_RUN:'0'}),0)
  assert.equal(massBacklogCompactorLimit({COS_UNIVERSITY_MASS_BACKLOG_COMPACTOR_MAX_PER_RUN:'999'}),200)
})

test('database compactor requires exact lineage plus a proven evaluated successor',()=>{
  assert.match(migration,/status='evaluation_pending'/)
  assert.match(migration,/new\.status in \('runtime_pending','active'\)/)
  assert.match(migration,/new\.subject_id is not distinct from old\.subject_id/)
  assert.match(migration,/new\.dataset_hash is not distinct from old\.dataset_hash/)
  assert.match(migration,/new\.teacher_model_id is not distinct from old\.teacher_model_id/)
  assert.match(migration,/new\.intended_use->>'batchKey'=old\.intended_use->>'batchKey'/)
  assert.match(migration,/new\.intended_use->>'canonicalBaseModel'=old\.intended_use->>'canonicalBaseModel'/)
  assert.match(migration,/new\.intended_use->'trainingReceipt'=old\.intended_use->'trainingReceipt'/)
  assert.match(migration,/mass_distilled_independent_evaluation_completed/)
  assert.match(migration,/lower\(coalesce\(e\.evidence->>'artifactHash',''\)\)=lower\(new\.trained_artifact_hash\)/)
})

test('predecessor must be untouched by canary or independent evaluation',()=>{
  assert.match(migration,/local_distilled_runtime_canary_%/)
  assert.match(migration,/mass_distilled_independent_evaluation_%/)
  assert.match(migration,/production_canary_healthy/)
  assert.match(migration,/independent_evaluation/)
})

test('retirement is bounded, durable and names the exact successor proof',()=>{
  assert.match(migration,/status='retired'/)
  assert.match(migration,/least\(greatest\(coalesce\(p_limit,50\),0\),200\)/)
  assert.match(migration,/exact_training_lineage_superseded/)
  assert.match(migration,/supersededByCandidateId/)
  assert.match(migration,/supersededByArtifactHash/)
  assert.match(migration,/proofClaim','mass_distilled_independent_evaluation_completed'/)
})

test('cron is authenticated, scheduled and calls only the bounded compactor RPC',()=>{
  assert.match(route,/CRON_SECRET/)
  assert.match(route,new RegExp(MASS_BACKLOG_COMPACTOR_RPC))
  const config=JSON.parse(vercel)
  const cron=config.crons.find((item:any)=>item.path==='/api/cron/cos-university-mass-backlog-compact')
  assert.ok(cron)
  assert.equal(cron.schedule,'13,28,43,58 * * * *')
})
