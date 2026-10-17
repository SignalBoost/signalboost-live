import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
const route=readFileSync(new URL('../app/api/builder/route.ts',import.meta.url),'utf8')
const runner=readFileSync(new URL('../lib/builder/job-runner.ts',import.meta.url),'utf8')
test('public Builder entrypoint rejects explicit V1 and labels standard jobs V2',()=>{
 assert.match(route,/requestedEngine !== undefined && requestedEngine !== 'v2'/)
 assert.match(route,/builderEngine: 'v2'/)
 assert.doesNotMatch(route,/requestedEngine !== 'v1'/)
})
test('runner routes every standard job through V2 and refuses V1 checkpoint replay',()=>{
 assert.match(runner,/if \(job\.jobKind === 'standard'\) \{/)
 assert.match(runner,/builder_v1_checkpoint_requires_fresh_v2_job/)
 assert.match(runner,/runBuilderV2JobCycle/)
 assert.doesNotMatch(runner,/if \(job\.jobKind === 'standard' && job\.metadata\.builderEngine === 'v2'\)/)
})
