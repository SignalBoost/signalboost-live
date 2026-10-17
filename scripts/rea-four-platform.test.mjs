import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildTransferReport} from './rea-builder-transfer.mjs'
const input=JSON.parse(readFileSync(new URL('../verification/rea/four-platform-evidence.json',import.meta.url),'utf8'))
test('all four user-requested targets present with independent source references',()=>{
 assert.deepEqual(input.targets,['Cursor','Windsurf','Lovable','v0'])
 for(const target of input.targets){
  const entries=input.findings.filter(f=>f.target===target)
  assert.ok(entries.length>=2,target+' needs at least two concrete observations')
  for(const f of entries){
   assert.match(f.evidence_location,/^https:\/\//)
   assert.equal(f.method,'documented-behavior')
   assert.ok(f.observation.length>15)
  }
 }
})
test('four-platform REA reports cannot mislabel public observations as runtime verification',()=>{
 const report=buildTransferReport(input)
 assert.equal(report.target,'multi-platform')
 assert.equal(report.observed_count,0)
 assert.ok(report.capabilities.some(x=>x.status==='static_or_documented_only'))
 assert.ok(report.capabilities.every(x=>x.status!=='behavior_observed'))
})
test('no feature parity can be declared from documentation-only evidence',()=>{
 const report=buildTransferReport(input)
 assert.equal(report.capabilities.filter(x=>x.status==='behavior_observed').length,0)
 assert.equal(report.capabilities.length,10)
})
