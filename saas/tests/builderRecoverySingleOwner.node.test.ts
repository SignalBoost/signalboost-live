import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read=(relative:string)=>readFileSync(new URL(relative,import.meta.url),'utf8')

test('History GET cannot mark Builder execution worker_lost while continuation cron owns recovery',()=>{
 const route=read('../app/api/assistant/chats/route.ts')
 assert.doesNotMatch(route,/reconcileStaleBuilderJobs/)
 assert.match(route,/expireStaleDurableCosTurns/)
})
test('Builder GET polling never expires a running claim or checkpoint',()=>{
 const store=read('../lib/builder/job-store.ts')
 const start=store.indexOf('export async function getBuilderJobForUser(')
 const end=store.indexOf('\n}',start)
 const body=store.slice(start,end)
 assert.match(body,/return job/)
 assert.doesNotMatch(body,/reconcileStaleBuilderJobs/)
})
test('continuation cron checks lease and does not terminalize checkpointed jobs',()=>{
 const cron=read('../app/api/cron/builder-continuations/route.ts')
 assert.ok(cron.indexOf("requeue_stale_builder_claims")<cron.indexOf("expire_stale_builder_jobs"))
 assert.match(cron,/\.eq\('status', 'running'\)\.is\('checkpoint', null\)\.lt\('updated_at', cutoff\)/)
 assert.match(cron,/last_heartbeat_at.*Date\.parse/)
})
test.todo('staging: concurrent History GET, poll GET and cron with checkpoint and live heartbeat must never terminalize active job')
test.todo('staging: expired checkpointed worker is fenced and resumed once by continuation cron')
