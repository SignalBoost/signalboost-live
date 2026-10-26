import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read=(p:string)=>readFileSync(new URL(p, import.meta.url),'utf8')
// Owner direction 2026-10-26: single-file jobs run the shared verified task loop; every other job is Builder V2.
test('Software Specialist dispatches V2 standard jobs, and single-file jobs only through the verified task loop',()=>{
  const s=read('../lib/ai/cos/softwareSpecialist.ts')
  assert.match(s,/builderEngine: 'v2'/)
  assert.match(s,/jobKind: debugPlan \? 'debug_file' : 'standard'/)
  assert.doesNotMatch(s,/Legacy Builder debug mode is retired/)
  // PR #4719 parity: a recorded project in this conversation is continued; only a bare selected workspace is refused.
  assert.match(s,/if \(!project\.context && selectionBody\?\.workspaceId\)/)
})
test('Developer surface disallows explicit V1; single-file jobs run the verified task loop',()=>{
  const s=read('../app/api/builder/route.ts')
  assert.match(s,/requestedEngine !== undefined && requestedEngine !== 'v2'/)
  assert.doesNotMatch(s,/builder_v1_debug_mode_retired_use_v2/)
  const runner=read('../lib/builder/job-runner.ts')
  assert.ok(runner.indexOf('runSingleFileVerifiedJob(job, singleFile)') < runner.indexOf("terminalFailure(job, 'builder_v1_retired_use_v2')"))
  assert.match(s,/builderEngine: 'v2'/)
})
test('worker refuses legacy dispatch without owner bypass',()=>{
  const s=read('../lib/builder/job-runner.ts')
  assert.match(s,/job\.jobKind !== 'standard' \|\| job\.metadata\.builderEngine !== 'v2'/)
  assert.match(s,/terminalFailure\(job, 'builder_v1_retired_use_v2'\)/)
  assert.doesNotMatch(s,/job\.ownerAuthorized === true && job\.jobKind === 'standard'\s*&& job\.metadata\.builderEngine === 'v2'/)
})
