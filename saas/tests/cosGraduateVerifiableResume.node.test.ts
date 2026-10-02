import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20261002004500_graduate_verifiable_resume.sql'),
  'utf8',
)

test('graduate resume is anchored to permanent AI identity and authoritative evidence', () => {
  assert.match(migration, /permanent_artifact_id as ai_id/i)
  assert.match(migration, /cos_university_artifact_birth_certificates/i)
  assert.match(migration, /cos_university_graduate_model_registry/i)
  assert.match(migration, /cos_university_graduate_lifecycle_events/i)
  assert.match(migration, /cos_university_graduate_serving_attempts/i)
  assert.match(migration, /count\(distinct a\.attempt_id\)/i)
})

test('graduate resume stays service-only and is not a writable profile', () => {
  assert.match(migration, /security_invoker = true/i)
  assert.match(migration, /revoke all .* from public, anon, authenticated/i)
  assert.match(migration, /grant select .* to service_role/i)
  assert.doesNotMatch(migration, /create table public\.cos_university_graduate_resumes/i)
})
