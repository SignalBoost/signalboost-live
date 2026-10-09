import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const readiness=readFileSync('app/api/admin/lab-phase-observability/readiness/route.ts','utf8')
const cron=readFileSync('app/api/internal/lab-phase-observability/health/route.ts','utf8')
const migration=readFileSync('supabase/migrations/20261009003000_lab_observability_valid_scope.sql','utf8')
test('readiness and cron require real scoped active Lab owner',()=>{
 assert.match(readiness,/tenantValid===true/)
 assert.match(readiness,/configured_tenant_has_no_active_lab_owner/)
 assert.ok(cron.indexOf("itmounts_lab_observability_scope_valid")<cron.indexOf('readTenantLabObservations('))
 assert.match(cron,/observability_scope_not_authorized/)
})
test('scope lookup is service-only and requires real membership',()=>{
 assert.match(migration,/lab\.organization_members/)
 assert.match(migration,/m\.role='owner' and m\.status='active'/)
 assert.match(migration,/revoke all on function .* from public,anon,authenticated/)
})
