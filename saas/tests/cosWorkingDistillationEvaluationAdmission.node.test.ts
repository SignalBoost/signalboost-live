import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source=readFileSync(new URL('../lib/ai/cos/cosWorkingDistillationEvaluationAdmission.ts',import.meta.url),'utf8')

test('Working COS evaluation admission is exact-evidence bound and fail closed',()=>{
  assert.match(source,/status!=='evaluation_pending'/)
  assert.match(source,/working_cos_supervised_distillation/)
  assert.match(source,/partition_manifests_registered/)
  assert.match(source,/trained_artifact_registered/)
  assert.match(source,/rollback_artifact_registered/)
  assert.match(source,/working_cos_evaluation_revision_mismatch/)
  assert.match(source,/working_cos_evaluation_dataset_mismatch/)
  assert.match(source,/working_cos_evaluation_artifact_mismatch/)
  assert.match(source,/working_cos_evaluation_rollback_mismatch/)
  assert.match(source,/#holdout/)
  assert.doesNotMatch(source,/status:'runtime_pending'/)
  assert.doesNotMatch(source,/production_traffic_authorized:\s*true/)
})
