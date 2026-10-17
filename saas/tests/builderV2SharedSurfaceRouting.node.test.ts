import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8')
test('COS and Concierge standard jobs explicitly select V2',()=>{
 const specialist=read('../lib/ai/cos/softwareSpecialist.ts')
 assert.match(specialist,/builderEngine: 'v2'/)
})
test('Developer surface rejects V1 opt-out and routes all standard jobs V2',()=>{
 const route=read('../app/api/builder/route.ts')
 assert.match(route,/requestedEngine !== undefined && requestedEngine !== 'v2'/)
 assert.match(route,/builderEngine: 'v2'/)
})
test('production standard jobs always use V2; legacy checkpoints fail closed',()=>{
 const runner=read('../lib/builder/job-runner.ts')
 assert.match(runner,/job\.jobKind === 'standard' && job\.metadata\.builderEngine !== 'v2' && job\.checkpoint/)
 assert.match(runner,/builder_v1_checkpoint_requires_fresh_v2_job/)
 assert.match(runner,/if \(job\.jobKind === 'standard'\)/)
})
