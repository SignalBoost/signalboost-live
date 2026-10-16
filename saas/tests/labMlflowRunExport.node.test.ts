import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLabMlflowRunSnapshot } from '../lib/lab/mlflowRunExport.ts'

const run = {runId:'1234abcd-1234-1234-1234-123456789012', stage:'completed',
  createdAt:'2026-10-16T12:00:00.000Z', teacherProviderKind:'together',
  teacherModel:'teacher/model', computeProviderKind:'fireworks',
  baseModel:'base/model', tunedModelId:'trained/model', artifactRepo:'repo/ref'}
test('exports completed LAB metadata without inventing metrics or MLflow registration', () => {
  const result = buildLabMlflowRunSnapshot(run)
  assert.equal(result.info.status, 'FINISHED')
  assert.equal(result.info.start_time, Date.parse(run.createdAt))
  assert.equal(result.data.metrics.length, 0)
  assert.equal(result.data.params.find(p=>p.key==='base_model')?.value, 'base/model')
  assert.equal(result.data.tags.find(p=>p.key==='lab.compute_provider')?.value, 'fireworks')
  assert.match(result.interoperability, /not imported/)
  assert.equal(JSON.stringify(result).includes('secret'), false)
})
test('maps failed and cancelled statuses without declaring completion', () => {
  assert.equal(buildLabMlflowRunSnapshot({...run,stage:'failed'}).info.status,'FAILED')
  assert.equal(buildLabMlflowRunSnapshot({...run,stage:'cancelled'}).info.status,'KILLED')
  assert.equal(buildLabMlflowRunSnapshot({...run,stage:'running'}).info.status,'RUNNING')
})
test('rejects invalid run identity and time', () => {
  assert.throws(()=>buildLabMlflowRunSnapshot({...run,runId:'../bad'}),/identifier/)
  assert.throws(()=>buildLabMlflowRunSnapshot({...run,createdAt:'garbage'}),/timestamp/)
})
