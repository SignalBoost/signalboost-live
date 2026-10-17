import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {classifyBuilderFailure} from '../../saas/lib/builder/rea-failure-classifier.ts'
const r=spawnSync('python3',['verification/builder/failure-classifier-smt.py'],{encoding:'utf8'})
assert.equal(r.status,0,r.stderr)
const cases=JSON.parse(r.stdout)
const signals=['Error [ERR_MODULE_NOT_FOUND]: package missing','SyntaxError: unexpected token',
  'AssertionError [ERR_ASSERTION]: failed','TypeError: unexpected undefined']
for (const {flags,expected} of cases) {
 const label=flags.map(Number).join('')
 test('SMT classifier precedence '+label,()=>{
  const message=signals.filter((_,i)=>flags[i]).join('\n')
  assert.equal(classifyBuilderFailure(message).kind,expected)
 })
}
test('evidence beyond bounded log tail cannot override recent failure',()=>{
 assert.equal(classifyBuilderFailure(signals[0]+'x'.repeat(13000)+'\n'+signals[3]).kind,'runtime')
})
test('unknown input cannot be promoted to source repair',()=>{
 assert.equal(classifyBuilderFailure('exit code 1').kind,'unknown')
})
