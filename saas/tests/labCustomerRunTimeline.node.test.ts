import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const sql=readFileSync(new URL('../supabase/migrations/20261015090000_lab_customer_safe_event_timeline.sql',import.meta.url),'utf8')
const api=readFileSync(new URL('../app/api/lab/training/trace/route.ts',import.meta.url),'utf8')
const ui=readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerRunTimeline.tsx',import.meta.url),'utf8')
test('scoped event read checks tenant membership and exact run ownership',()=>{
 assert.match(sql,/lab\.customer_member_role\(uid, p_organization_id\) is null/)
 assert.match(sql,/where id = p_run_id and organization_id = p_organization_id/)
 assert.match(sql,/where organization_id = p_organization_id and run_id = p_run_id/)
 assert.match(sql,/revoke all on function public\.itmounts_lab_customer_safe_training_events/)
 assert.match(sql,/grant execute on function public\.itmounts_lab_customer_safe_training_events\(uuid,uuid\) to authenticated/)
})
test('only safe allowlisted event categories escape existing append-only event journal',()=>{
 assert.match(sql,/case when e\.event in/)
 assert.match(sql,/else 'other' end/)
 assert.match(sql,/order by id desc limit 100/)
 assert.doesNotMatch(sql,/\x27detail\x27\s*,\s*e\.detail|\x27user\x27\s*,/)
 assert.doesNotMatch(api,/service_role|createAdminClient/)
})
test('customer trace is authenticated, read-only and registered for observation',()=>{
 assert.match(api,/customerSession\(\)/)
 assert.match(api,/UUID_RE\.test\(organizationId\)/)
 assert.match(api,/observeLabRequest\('training\.trace'/)
 assert.match(ui,/fetch\('\/api\/lab\/training\/trace\?'/)
 assert.doesNotMatch(ui,/localStorage|sessionStorage/)
})
