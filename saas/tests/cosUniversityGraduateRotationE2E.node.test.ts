import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('Workforce serving is request-scoped and no longer constrained by a 24-hour rotation lease', async () => {
  const runtime = await readFile(new URL('../lib/ai/cos/cosUniversityGraduateRuntime.ts', import.meta.url), 'utf8')
  const protection = await readFile(new URL('../lib/ai/cos/cosUniversityGraduateEndpointProtection.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(runtime, /selectGraduateFor24HourLease/)
  assert.doesNotMatch(runtime, /cos_university_graduate_rotation_leases/)
  assert.match(runtime, /return result/)
  assert.match(protection, /cos_workforce_roster/)
  assert.match(protection, /status', 'on_call'/)
  assert.doesNotMatch(protection, /cos_university_graduate_rotation_leases/)
})

test('rotation lease schema is append-only and authority cannot expand', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260926235500_graduate_rotation_leases.sql', import.meta.url), 'utf8')
  assert.match(migration, /lease_number bigint not null unique/)
  assert.match(migration, /authority_expanded boolean not null default false check \(authority_expanded = false\)/)
  assert.match(migration, /before update or delete/)
  assert.match(migration, /grant select, insert .* service_role/)
  assert.match(migration, /rollback_artifact_ref text not null/)
})
