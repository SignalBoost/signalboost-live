import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const migration=readFileSync('supabase/migrations/20261008231500_lab_phase_observability.sql','utf8')
const route=readFileSync('app/api/admin/lab-phase-observability/route.ts','utf8')
test('durable observations are tenant scoped and service-only',()=>{
 assert.match(migration,/tenant_id text not null/)
 assert.match(migration,/enable row level security/)
 assert.match(migration,/revoke all on public.lab_phase_observations from anon, authenticated/)
 assert.match(migration,/independently_certified = false/)
 assert.match(migration,/production_authorized = false/)
})
test('owner endpoint has authorization before admin reads and fails closed on missing configuration',()=>{
 assert.ok(route.indexOf('await requireOwner()')<route.indexOf('getAdminSupabase()'))
 assert.match(route,/ITMOUNTS_LAB_OBSERVABILITY_TENANT_ID/)
 assert.match(route,/VERCEL_GIT_COMMIT_SHA/)
 assert.match(route,/\.eq\('tenant_id',tenant\)/)
 assert.doesNotMatch(route,/searchParams/)
 assert.match(route,/assessLabPhaseHealth\(events,revision,Date\.now\(\)\)/)
})
