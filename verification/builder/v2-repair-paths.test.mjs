import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
const x=spawnSync('python3',['verification/builder/v2-repair-paths.py'],{encoding:'utf8'})
assert.equal(x.status,0,x.stderr)
const cases=JSON.parse(x.stdout)
for(const {conditions:c,must_target} of cases){
 test('Z3 recovery path '+Object.values(c).map(Number).join(''),()=>{
  const targets=c.failed_suite&&c.test_named&&c.source_present
  // The repair target cannot be lost when unrelated files or package
  // conflicts appear in the inspection history.
  assert.equal(targets,must_target)
  if(targets){
    assert.equal(targets && c.unrelated_read,true)
    // Presence of a package conflict must not remove the source target.
    assert.equal(targets && c.package_conflict,c.package_conflict)
  }
 })
}
