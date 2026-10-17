import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read=(p:string)=>readFileSync(new URL(p, import.meta.url),'utf8')

test('COS and Concierge fresh standard jobs have V2 durable metadata',()=>{
  const specialist=read('../lib/ai/cos/softwareSpecialist.ts')
  assert.match(specialist,/!project\.context && !input\.body\?\.workspaceId \? \{ builderEngine: 'v2' \}/)
  assert.match(specialist,/jobKind: debugPlan \? 'debug_file' : 'standard'/)
})
test('Developer surface defaults new standard jobs to V2 but keeps explicit V1 compatibility',()=>{
  const route=read('../app/api/builder/route.ts')
  assert.match(route,/requestedEngine !== 'v1' && !selectedWorkspaceId && !project\.context/)
  assert.match(route,/requestedEngine === 'v2'/)
})
test('durable V2 job dispatch is not owner-only and old V1 jobs keep legacy loop',()=>{
  const runner=read('../lib/builder/job-runner.ts')
  assert.match(runner,/job\.jobKind === 'standard' && job\.metadata\.builderEngine === 'v2'/)
  assert.doesNotMatch(runner,/job\.ownerAuthorized === true && job\.jobKind === 'standard'\s*&& job\.metadata\.builderEngine === 'v2'/)
  assert.match(runner,/new BuilderToolLoop/)
})
