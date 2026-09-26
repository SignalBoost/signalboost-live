import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('XSA starts fail-closed until training and inference share one runtime', () => {
  const worker = source('../scripts/cos-university-hf-worker.py')
  assert.match(worker, /XSA_PROFILE = "exclusive_self_attention_v1"/)
  assert.match(worker, /XSA_ROLLOUT_PERCENT = 100/)
  assert.match(worker, /XSA_INFERENCE_SYMMETRY_REQUIRED = True/)
  assert.match(worker, /ITMOUNTS_UNIVERSITY_STANDARD_ATTENTION_CONTROL/)
  assert.match(worker, /worker_xsa_selected_without_symmetric_runtime/)
  assert.match(worker, /"attentionArchitecture": "standard_attention"/)
  assert.match(worker, /"xsaReason": "explicit_standard_attention_control"/)
})

test('frontier training writes durable XSA architecture evidence', () => {
  const worker = source('../scripts/cos-university-hf-worker.py')
  const training = worker.slice(worker.indexOf('def train_student'), worker.indexOf('def main()'))
  assert.match(training, /recipe\.update\(_xsa_canary_evidence\(/)
  assert.match(training, /itmounts_attention_architecture/)
  assert.match(training, /xsaInferenceSymmetryRequired/)
  assert.match(worker, /\"xsaInstalledAttentionLayers\": 0/)

  const consumer = source('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  assert.match(consumer, /attentionArchitecture: clean\(raw\.attentionArchitecture, 80\) \|\| null/)
  assert.match(consumer, /xsaProfile: clean\(raw\.xsaProfile, 120\) \|\| null/)
  assert.match(consumer, /xsaRolloutPercent: integer\('xsaRolloutPercent', 0, 100\)/)
  assert.match(consumer, /xsaRolloutSelected: boolean\('xsaRolloutSelected'\)/)
  assert.match(consumer, /xsaTrainingApplied: boolean\('xsaTrainingApplied'\)/)
  assert.match(consumer, /xsaInferenceSymmetryRequired: boolean\('xsaInferenceSymmetryRequired'\)/)
})

test('ONBOARD documents the XSA graduation boundary', () => {
  const onboard = source('../../ONBOARD.md')
  assert.match(onboard, /Exclusive Self Attention \(XSA\) University invariant/)
  assert.match(onboard, /training, independent evaluation, exact-artifact canary/)
  assert.match(onboard, /Muon stays out of the first XSA treatment cohort/)
  assert.match(onboard, /contract\/receipt scaffold/)
})
