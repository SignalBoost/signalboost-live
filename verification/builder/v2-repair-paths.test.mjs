import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {builderV2RecoveryPriority} from '../../saas/lib/builder/agent-v2.ts'
const result=spawnSync('python3',['verification/builder/v2-repair-paths.py'],{encoding:'utf8'})
assert.equal(result.status,0,result.stderr)
const cases=JSON.parse(result.stdout)
assert.equal(cases.length,64)
for(const {conditions:c,must_target} of cases) {
 test('Z3-to-real-recovery '+Object.values(c).map(Number).join(''),()=>{
  const files=c.source_present?['test/orders.test.js','src/orders.js','package.json']:['package.json']
  const ordered=builderV2RecoveryPriority({
   failedSuite:c.failed_suite,
   namedTest:c.test_named?'test/orders.test.js':null,
   importedModules:['src/orders.js'],
   existingFiles:files,
   previouslyOpened:c.unrelated_read?['package.json']:[],
  })
  assert.equal(ordered.includes('src/orders.js'),must_target)
  assert.equal(ordered.includes('test/orders.test.js'),must_target)
  if(must_target)assert.deepEqual(ordered.slice(0,2),['test/orders.test.js','src/orders.js'])
  if(c.unrelated_read)assert.ok(ordered.includes('package.json'))
  assert.equal(new Set(ordered).size,ordered.length)
 })
}
