import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('University frontier training has a bounded native Muon optimizer canary with AdamW fallback', () => {
  const worker = source('../scripts/cos-university-hf-worker.py')
  assert.match(worker, /MUON_ROLLOUT_PERCENT = 10/)
  assert.match(worker, /MUON_MOMENTUM = 0\.95/)
  assert.match(worker, /MUON_NS_STEPS = 5/)
  assert.match(worker, /MUON_ADJUST_LR_FN = "match_rms_adamw"/)
  assert.match(worker, /def _configure_muon_canary\(base, torch, trainer, candidate_id: str\)/)
  assert.match(worker, /int\(base\.sha256\(normalized_candidate\)\[:8\], 16\) % 100 < MUON_ROLLOUT_PERCENT/)
  assert.match(worker, /matrix_params = \[parameter for _, parameter in trainable if parameter\.ndim == 2\]/)
  assert.match(worker, /non_matrix_params = \[parameter for _, parameter in trainable if parameter\.ndim != 2\]/)
  assert.match(worker, /runtime_available = callable\(getattr\(torch\.optim, "Muon", None\)\)/)
  assert.match(worker, /eligible = bool\(matrix_params\) and not non_matrix_params/)
  assert.match(worker, /trainer\.optimizer = torch\.optim\.Muon\(/)
  assert.match(worker, /adjust_lr_fn=MUON_ADJUST_LR_FN/)
  assert.match(worker, /optimizer_name = "adamw_torch"/)
  assert.match(worker, /reason = "runtime_unavailable"/)
  assert.match(worker, /reason = "non_matrix_trainables"/)
})

test('Muon is limited to the governed frontier pass and writes durable optimizer evidence', () => {
  const worker = source('../scripts/cos-university-hf-worker.py')
  const training = worker.slice(worker.indexOf('def train_student'), worker.indexOf('def main()'))
  assert.match(training, /if frontier_plan is not None:\n        optimizer_evidence = _configure_muon_canary/)
  assert.match(training, /"parameterOptimizer": "adamw_torch"/)
  assert.match(training, /"muonReason": "legacy_lane"/)
  assert.match(training, /itmounts_parameter_optimizer/)
  assert.match(training, /trainer\.train\(\)/)

  const consumer = source('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  assert.match(consumer, /parameterOptimizer: clean\(raw\.parameterOptimizer, 80\) \|\| null/)
  assert.match(consumer, /muonRolloutPercent: integer\('muonRolloutPercent', 0, 100\)/)
  assert.match(consumer, /muonRolloutSelected: boolean\('muonRolloutSelected'\)/)
  assert.match(consumer, /muonRuntimeAvailable: boolean\('muonRuntimeAvailable'\)/)
  assert.match(consumer, /muonEligible: boolean\('muonEligible'\)/)
  assert.match(consumer, /muonApplied: boolean\('muonApplied'\)/)
  assert.match(consumer, /muonMatrixTensorCount: integer\('muonMatrixTensorCount', 0, 1_000_000\)/)
  assert.match(consumer, /muonNonMatrixTensorCount: integer\('muonNonMatrixTensorCount', 0, 1_000_000\)/)
})

test('platform onboarding keeps Muon scoped to real weight training and existing graduation gates', () => {
  const onboard = source('../../ONBOARD.md')
  assert.match(onboard, /Muon optimizer adoption invariant \(2026-09-25\)/)
  assert.match(onboard, /model weight-training optimizer/)
  assert.match(onboard, /deterministic \*\*10% optimizer canary\*\*/)
  assert.match(onboard, /every trainable tensor is a 2-D LoRA matrix/)
  assert.match(onboard, /Do not blanket-replace AdamW/)
})
