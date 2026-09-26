import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('rotation is an autonomous durable controller, not request-only selection', async () => {
  const route = await readFile(new URL('../app/api/cron/cos-university-graduate-rotation/route.ts', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../lib/ai/cos/cosUniversityGraduateRuntime.ts', import.meta.url), 'utf8')
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.match(route, /proveGraduateServedIdentity/)
  assert.match(route, /cos_university_graduate_rotation_leases/)
  assert.match(route, /runtime_health_evidence_hash/)
  assert.match(route, /authority_expanded:false/)
  assert.match(runtime, /cos_university_graduate_rotation_leases/)
  assert.ok(vercel.crons.some((c:any)=>c.path === '/api/cron/cos-university-graduate-rotation' && c.schedule === '17 * * * *'))
})

test('rotation lease schema is append-only and authority cannot expand', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260926235500_graduate_rotation_leases.sql', import.meta.url), 'utf8')
  assert.match(migration, /lease_number bigint not null unique/)
  assert.match(migration, /authority_expanded boolean not null default false check \(authority_expanded = false\)/)
  assert.match(migration, /before update or delete/)
  assert.match(migration, /grant select, insert .* service_role/)
  assert.match(migration, /rollback_artifact_ref text not null/)
})
