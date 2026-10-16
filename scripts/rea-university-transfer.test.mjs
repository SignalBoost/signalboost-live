import test from 'node:test'
import assert from 'node:assert/strict'
import { CAPABILITIES, PLATFORMS, buildUniversityTransferReport } from './rea-university-transfer.mjs'

test('empty findings never claim observed platform parity', () => {
  const report=buildUniversityTransferReport({findings:[]})
  assert.equal(report.capabilities.length,CAPABILITIES.length)
  assert.ok(report.capabilities.every(c=>c.status==='unverified'))
  assert.equal(report.source_count,0)
})
test('documents alone do not establish tested behavior', () => {
  const report=buildUniversityTransferReport({findings:[{
    platform:'Hugging Face',capability:'fine_tuning',method:'official-docs',
    version:'current-reviewed',evidence_location:'https://huggingface.co/docs',
    observation:'The docs describe training jobs',limitations:'No customer run tested'
  }]})
  assert.equal(report.capabilities.find(c=>c.id==='fine_tuning').status,'documented_or_static_only')
})
test('controlled probe is independently tracked', () => {
  const report=buildUniversityTransferReport({findings:[{
    platform:'Together AI',capability:'fine_tuning',method:'controlled-probe',
    version:'test-run-1',evidence_location:'private://test/evidence-1',
    observation:'Sandbox job completed and artifact downloaded',limitations:'Only one sandbox model'
  }]})
  assert.equal(report.capabilities.find(c=>c.id==='fine_tuning').status,'behavior_observed')
  assert.equal(report.source_count,1)
})
test('unknown platforms and incomplete evidence are rejected', () => {
  assert.ok(PLATFORMS.includes('Databricks Mosaic AI'))
  assert.throws(()=>buildUniversityTransferReport({findings:[{platform:'Unknown'}]}),/Invalid evidence/)
  assert.throws(()=>buildUniversityTransferReport({findings:null}),/findings must be an array/)
})
test('credential-bearing URLs are rejected', () => {
  assert.throws(()=>buildUniversityTransferReport({findings:[{
    platform:'Kaggle',capability:'dataset_preflight',method:'controlled-probe',
    version:'1',evidence_location:'https://user:password@host.test/proof',
    observation:'Observed',limitations:'Sandbox only'
  }]}),/Credential-bearing/)
})
