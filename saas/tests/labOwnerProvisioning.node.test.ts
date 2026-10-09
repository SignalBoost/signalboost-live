import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const route=readFileSync('app/api/admin/lab-phase-observability/provision/route.ts','utf8')
const sql=readFileSync('supabase/migrations/20261009001500_lab_owner_org_provisioning.sql','utf8')
test('provisioning requires explicitly named owner-confirmed request and verified session',()=>{
 assert.ok(route.indexOf('await requireOwner()')<route.indexOf("rpc('itmounts_lab_provision_owner_organization'"))
 assert.match(route,/guard\.ctx\.userId/)
 assert.match(route,/body\?\.confirmActivation!==true/)
 assert.doesNotMatch(route,/searchParams/)
})
test('provisioning is service-only, atomic and unfunded',()=>{
 assert.match(sql,/pg_advisory_xact_lock/)
 assert.match(sql,/insert into lab\.organization_members/)
 assert.match(sql,/insert into lab\.credit_accounts/)
 assert.match(sql,/values\(new_id,0,0,0,0\)/)
 assert.match(sql,/revoke all on function public\.itmounts_lab_provision_owner_organization\(uuid,text\) from public,anon,authenticated/)
})
