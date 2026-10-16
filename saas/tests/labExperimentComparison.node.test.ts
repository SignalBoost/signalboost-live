import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLabExperimentComparison } from '../lib/lab/labExperimentComparison.ts'

const run = (runId: string, computeProviderKind: string, stage = 'completed') => ({
  runId, createdAt: '2026-10-16T12:00:00.000Z', stage,
  teacherProviderKind: 'openai', teacherModel: 'teacher/model',
  baseModel: 'base/model', computeProviderKind, artifactRepo: 'customer/artifact',
  artifactRevision: 'abc123', artifactHash: 'a'.repeat(64),
})
test('exports multi-provider training experiments without invented scores or credentials', () => {
  const comparison = buildLabExperimentComparison([run('run-together','together'),run('run-fireworks','fireworks','failed')])
  assert.equal(comparison.count, 2)
  assert.deepEqual(comparison.runs.map(r=>r.computeProvider), ['fireworks','together'])
  assert.deepEqual(comparison.runs.map(r=>r.state), ['FAILED','FINISHED'])
  assert.equal(comparison.runs[0].artifactHash, 'a'.repeat(64))
  assert.doesNotMatch(JSON.stringify(comparison), /secret|credential|qualityScore|apiKey/)
  assert.match(comparison.verification, /no_quality_claim/)
})
test('rejects duplicate experiments and invalid identities before export', () => {
  const r=run('same-run','together')
  assert.throws(()=>buildLabExperimentComparison([r,r]), /duplicate_run/)
  assert.throws(()=>buildLabExperimentComparison([run('../bad','together')]), /identifier/)
  assert.throws(()=>buildLabExperimentComparison([]), /count_invalid/)
  assert.throws(()=>buildLabExperimentComparison(Array.from({length:101},(_,i)=>run('run-'+i,'together'))), /count_invalid/)
})
