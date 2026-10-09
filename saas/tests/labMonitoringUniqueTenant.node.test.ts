import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const sql=readFileSync('supabase/migrations/20261009005000_lab_observability_unique_tenant.sql','utf8')
const resolver=readFileSync('lib/ai/cos/labMonitoringTenant.ts','utf8')
test('automatic monitoring scope requires exactly one genuine owner-bound organization',()=>{
 assert.match(sql,/select distinct o\.id/)
 assert.match(sql,/m\.role='owner' and m\.status='active'/)
 assert.match(sql,/count\(\*\)=1/)
 assert.match(sql,/revoke all on function .* from public,anon,authenticated/)
})
test('explicit scope never falls back to a different organization',()=>{
 assert.match(resolver,/if\(configured\)/)
 assert.match(resolver,/itmounts_lab_observability_scope_valid/)
 assert.match(resolver,/return data===true\?configured:null/)
 assert.match(resolver,/itmounts_lab_observability_unique_tenant/)
})
