import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const consumer = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityMassDistillationConsumer.ts'), 'utf8')
const worker = fs.readFileSync(path.join(ROOT, 'scripts/cos-university-hf-worker-base.py'), 'utf8')
const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260919010500_cos_university_multi_provider_teacher_outputs.sql'), 'utf8')
const synthesis = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityMultiProviderTeacherSynthesis.ts'), 'utf8')

test('mass distillation executes the enterprise teacher pool instead of only reporting readiness', () => {
  assert.match(consumer, /selectUniversityTeacherForBatch/)
  assert.match(consumer, /synthesizeHostedTeacherBatch/)
  assert.match(consumer, /operation: 'materialize_teacher_dataset'/)
  assert.match(consumer, /teacher_provider_manifest_hash/)
  assert.match(consumer, /teacher_training_rights/)
})

test('hosted teacher generation is resumable and never silently switches an assigned provider', () => {
  assert.match(synthesis, /cos_university_mass_distillation_teacher_outputs/)
  assert.match(synthesis, /multi_provider_teacher_resume_provider_unavailable/)
  assert.match(synthesis, /multi_provider_teacher_resume_model_changed/)
  assert.match(synthesis, /DISTILLATION_RIGHTS/)
  assert.match(synthesis, /contractually_authorized/)
  assert.match(synthesis, /multi_provider_teacher_retry_budget_exhausted/)
  assert.match(synthesis, /priorCommittedCostUsd \+ perCallMaximum/)
  assert.match(consumer, /clean\(run\.teacher_provider, 80\)/)
})

test('hosted provider spend remains committed when HF materialization releases unused reserve', () => {
  assert.match(consumer, /reservedCostCeilingUsd: hfCostCeilingUsd/)
  assert.match(consumer, /stageReservedCostCeilingUsd: expectedCeiling/)
  assert.match(consumer, /hostedTeacherCommittedCeilingUsd: hostedTeacherMaximumCostUsd/)
})

test('materialization worker preserves provider provenance and excludes hidden reasoning', () => {
  assert.match(worker, /def materialize_teacher_dataset/)
  assert.match(worker, /provider_manifest_hash/)
  assert.match(worker, /provider_output_contractually_authorized/)
  assert.match(worker, /re\.search\(r"<\/?think>"/)
  assert.match(worker, /teacherProviderManifestHash/)
})

test('durable provider ledger is service-role only and stores no credential field', () => {
  assert.match(migration, /create table if not exists public\.cos_university_mass_distillation_teacher_outputs/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all .* public, anon, authenticated/s)
  assert.match(migration, /grant select, insert, update, delete .* service_role/s)
  assert.match(migration, /preserve_cos_university_hosted_teacher_committed_cost/)
  assert.match(migration, /greatest\(coalesce\(new\.committed_cost_usd,0\), v_hosted_cost\)/)
  assert.doesNotMatch(migration, /\b(?:api_key|credential|secret|access_token)\s+text\b/i)
})
