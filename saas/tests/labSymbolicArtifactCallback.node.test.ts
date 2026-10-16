import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { interpretWorkerCallback } from '../lib/ai/cos/labCustomerTraining.ts'

// CI generates models with the real Z3 SMT solver. Test the REAL application callback,
// not a duplicate policy model. Local runs without Z3 skip this optional verifier.
const file = process.env.LAB_Z3_CASES_FILE
test('Z3 counterexample replay: customer LAB artifact registration is fail-closed', { skip: !file && 'Z3 model file supplied by symbolic-verification CI job' }, () => {
  const data = JSON.parse(readFileSync(file!, 'utf8'))
  assert.equal(data.schema, 'itmounts.lab.z3.artifact_callback.v1')
  assert.equal(data.cases.length, 64)
  for (const c of data.cases as Array<Record<string, boolean | string>>) {
    const run = {
      runId: '11111111-2222-4333-8444-555555555555',
      organizationId: '11111111-2222-4333-8444-555555555555',
      stage: c.stage_ok ? 'training' : 'preparing_dataset',
      baseModel: 'Qwen/Qwen3', baseModelRevision: null,
      datasetHash: 'd'.repeat(64), hfNamespace: c.namespace_ok ? 'customer' : null,
    }
    const payload = {
      claim: 'trained_artifact_registered',
      candidateId: c.candidate_ok ? 'lab-' + run.runId : 'lab-foreign',
      evidenceRef: c.account_ok ? 'hf://models/customer/student@abc123' : 'hf://models/foreign/student@abc123',
      artifactHash: c.hash_ok ? 'a'.repeat(64) : 'invalid_hash',
    }
    // A duplicate-identical artifact callback cannot supply a partition manifest:
    // the unique_ok predicate is enforced in the earlier dataset registration stage.
    // Test this predicate independently below; do not mistake it for an artifact field.
    const verdict = interpretWorkerCallback(run, payload)
    const eligible = c.candidate_ok && c.namespace_ok && c.stage_ok && c.account_ok && c.hash_ok
    assert.equal(verdict.kind, eligible ? 'complete' : 'reject', JSON.stringify(c))
    if (verdict.kind === 'complete') {
      assert.equal(verdict.patch.artifactRepo, 'customer/student')
      assert.equal(verdict.patch.artifactRevision, 'abc123')
    }
    // Also replay the dataset partition contract with the unique_ok constraint.
    const trainHashes = Array.from({length: 8}, (_, i) => i.toString(16).padStart(64, '0'))
    const holdoutHashes = [ 'a'.repeat(64), c.unique_ok ? 'b'.repeat(64) : trainHashes[0] ]
    const datasetRun = { ...run, stage: c.stage_ok ? 'preparing_dataset' : 'training' }
    const datasetPayload = {
      claim: 'partition_manifests_registered', candidateId: payload.candidateId,
      datasetHash: run.datasetHash,
      trainingDataRef: c.account_ok ? 'hf://datasets/customer/set@abc123#train' : 'hf://datasets/foreign/set@abc123#train',
      holdoutDataRef: c.account_ok ? 'hf://datasets/customer/set@abc123#holdout' : 'hf://datasets/foreign/set@abc123#holdout',
      trainingItemHashes: trainHashes, holdoutItemHashes: holdoutHashes,
    }
    const datasetVerdict = interpretWorkerCallback(datasetRun, datasetPayload)
    const allowed = c.candidate_ok && c.namespace_ok && c.stage_ok && c.account_ok && c.unique_ok
    assert.equal(datasetVerdict.kind, allowed ? 'start_training' : 'reject', JSON.stringify(c))
  }
})
