import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTransferReport } from '../scripts/rea-builder-transfer.mjs'
test('raw static REA output does not fabricate Cursor functionality', () => {
  assert.throws(() => buildTransferReport({modules:[]}),/curated findings/)
})
test('unobserved features stay unverified', () => {
  const result=buildTransferReport({findings:[]})
  assert.equal(result.observed_count,0)
  assert.equal(result.capabilities.length,10)
  assert.ok(result.capabilities.every(x=>x.status==='unverified'))
})
test('static findings never count as confirmed runtime behavior', () => {
  const report=buildTransferReport({findings:[{target:'Cursor',capability:'checkpoint_resume',method:'rea-static',
    evidence_location:'local-module:agent',observation:'module references persistence'}]})
  assert.equal(report.observed_count,0)
  assert.equal(report.capabilities.find(x=>x.id==='checkpoint_resume').status,'static_or_documented_only')
})
test('runtime probes require recorded observations and retain provenance', () => {
  const report=buildTransferReport({findings:[{target:'Cursor',capability:'test_repair',method:'controlled-probe',
    evidence_location:'local://trial-001/trace.json',observation:'failed test repaired and rerun'}]})
  assert.equal(report.observed_count,1)
  assert.equal(report.capabilities.find(x=>x.id==='test_repair').evidence[0].location,'local://trial-001/trace.json')
  assert.equal(report.acceptance.commands.length,3)
})
test('missing evidence and wrong target cannot establish feature parity', () => {
  const report=buildTransferReport({findings:[{target:'Cursor',capability:'task_planning',method:'rea-runtime',
    observation:'claimed without evidence'}, {target:'Other',capability:'task_planning',method:'rea-runtime',
    evidence_location:'probe',observation:'actual behavior'}]})
  assert.equal(report.observed_count,0)
})
