import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const store=readFileSync(new URL('../lib/builder/job-store.ts',import.meta.url),'utf8')
const route=readFileSync(new URL('../app/api/builder/route.ts',import.meta.url),'utf8')
const page=readFileSync(new URL('../app/dashboard/developer/page.tsx',import.meta.url),'utf8')
test('Stop uses user scope, generation fencing, and preserves checkpoint/workspace files',()=>{
 assert.match(store,/export async function stopBuilderJobForUser/)
 assert.match(store,/\.eq\('user_id',userId\)/)
 assert.match(store,/claim_generation:data\.claim_generation\+1/)
 assert.match(store,/\.eq\('claim_generation',data\.claim_generation\)/)
 assert.doesNotMatch(store.slice(store.indexOf('export async function stopBuilderJobForUser')),/checkpoint\s*:\s*null|delete\(/)
})
test('Stop route authenticates and UI offers actual server-side cancellation',()=>{
 assert.match(route,/export async function DELETE/)
 assert.match(route,/stopBuilderJobForUser\(jobId,access\.userId\)/)
 assert.match(page,/Stop Builder/)
 assert.match(page,/method:'DELETE'/)
})
