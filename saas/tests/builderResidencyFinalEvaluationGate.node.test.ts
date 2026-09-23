import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL(
  '../supabase/migrations/20260923011000_builder_residency_final_evaluation_gate.sql',
  import.meta.url,
)

test('Computer Science final canary claim requires exact Residency completion', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /claim_next_mass_distilled_runtime_canary/)
  assert.match(sql, /a\.subject_id <> 'Computer Science & Coding'/)
  assert.match(sql, /from public\.cos_university_residency_enrollments r/)
  assert.match(sql, /r\.candidate_id=a\.candidate_id/)
  assert.match(sql, /r\.trained_artifact_hash=a\.trained_artifact_hash/)
  assert.match(sql, /r\.standing='residency_complete'/)
  assert.match(sql, /r\.completed_at is not null/)
  assert.match(sql, /r\.authority_expanded=false/)
})

test('pre-Residency canary pass cannot satisfy post-Residency final canary', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(
    sql,
    /e\.observed_at >= \(\s*select max\(r\.completed_at\)[\s\S]*r\.trained_artifact_hash=v_artifact\.trained_artifact_hash/,
  )
})

test('independent evaluation requires a post-Residency exact-artifact canary', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /claim_next_mass_distilled_evaluation/)
  assert.match(sql, /e\.evidence->>'claim'='production_canary_healthy'/)
  assert.match(sql, /e\.evidence->>'exactArtifact'='true'/)
  assert.match(
    sql,
    /e\.observed_at >= \(\s*select max\(r\.completed_at\)[\s\S]*r\.standing='residency_complete'/,
  )
})

test('Residency final gate is scoped to Computer Science and preserves other subjects', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  const scopedBypass = /a\.subject_id <> 'Computer Science & Coding'\s+or exists/
  assert.match(sql, scopedBypass)
  assert.doesNotMatch(sql, /productionTrafficAuthorized'\)::boolean\s*<>\s*false/)
  assert.match(sql, /productionTrafficAuthorized',false/)
  assert.match(sql, /authorityExpanded',false/)
})
