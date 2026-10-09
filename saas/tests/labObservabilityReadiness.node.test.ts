import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const route=readFileSync('app/api/admin/lab-phase-observability/readiness/route.ts','utf8')
const sql=readFileSync('supabase/migrations/20261008235900_lab_observability_readiness.sql','utf8')
test('owner-only readiness cannot return organization IDs or mint a tenant',()=>{
 assert.ok(route.indexOf('await requireOwner()')<route.indexOf('getAdminSupabase()'))
 assert.match(route,/no_registered_lab_organizations/)
 assert.match(route,/liveEvidenceVerified:false,supervisorDeliveryVerified:false/)
 assert.doesNotMatch(route,/\.insert\(|\.update\(|\.upsert\(/)
})
test('organization counts available to service role only',()=>{
 assert.match(sql,/revoke all on function public\.itmounts_lab_observability_owner_organization_count\(\) from public,anon,authenticated/)
 assert.match(sql,/grant execute on function public\.itmounts_lab_observability_owner_organization_count\(\) to service_role/)
})
