import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTransferReport } from './rea-builder-transfer.mjs'

test('Cursor remains default and cannot claim parity without evidence', () => {
  const report = buildTransferReport({ findings: [] })
  assert.equal(report.target, 'Cursor')
  assert.equal(report.observed_count, 0)
  assert.ok(report.capabilities.every(x => x.status === 'unverified'))
})

test('four references aggregate evidence but distinguish documents from probes', () => {
  const report = buildTransferReport({
    targets: ['Cursor', 'Windsurf', 'Lovable', 'v0'],
    findings: [
      { target:'Windsurf', capability:'checkpoint_resume', method:'controlled-probe', evidence_location:'local:probe-1', observation:'resumed task' },
      { target:'v0', capability:'workspace_editing', method:'documented-behavior', evidence_location:'official docs', observation:'generates code' },
      { target:'Lovable', capability:'test_repair', method:'rea-static', evidence_location:'local:module-1', observation:'static module reference' },
      { target:'Cursor', capability:'terminal_execution', method:'rea-runtime', evidence_location:'local:trace-1', observation:'command exit receipt' },
    ],
  })
  assert.equal(report.observed_count, 2)
  assert.equal(report.capabilities.find(x => x.id === 'checkpoint_resume').evidence[0].target, 'Windsurf')
  assert.equal(report.capabilities.find(x => x.id === 'workspace_editing').status, 'static_or_documented_only')
  assert.equal(report.capabilities.find(x => x.id === 'test_repair').status, 'static_or_documented_only')
  assert.equal(report.capabilities.find(x => x.id === 'terminal_execution').status, 'behavior_observed')
})

test('rejects unsupported or duplicate source targets', () => {
  assert.throws(() => buildTransferReport({ targets:['Cursor','Cursor'], findings:[] }))
  assert.throws(() => buildTransferReport({ targets:['Other'], findings:[] }))
})
