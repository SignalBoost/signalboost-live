import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('shared XSA runtime projects per head using the actual Qwen3 value projection', () => {
  const runtime = source('../scripts/cos-university-xsa-runtime.py')
  assert.match(runtime, /def exclusive_self_attention_projection\(/)
  assert.match(runtime, /value\.repeat_interleave\(num_attention_heads \/\/ num_key_value_heads, dim=2\)/)
  assert.match(runtime, /F\.normalize\(value, p=2\.0, dim=-1, eps=eps\)/)
  assert.match(runtime, /projected = y - \(y \* value_unit\)\.sum\(dim=-1, keepdim=True\) \* value_unit/)
  assert.match(runtime, /value_proj\.register_forward_hook\(capture_value\)/)
  assert.match(runtime, /output_proj\.register_forward_pre_hook\(project_output\)/)
  assert.match(runtime, /usesActualValueProjection/)
  assert.match(runtime, /gqaAware/)
})

test('HF delivery and worker loader bind the exact governed XSA runtime source', () => {
  const route = source('../app/api/internal/cos/hf-worker/[capability]/[filename]/route.ts')
  const worker = source('../scripts/cos-university-hf-worker.py')
  assert.match(route, /cos-university-xsa-runtime\.py/)
  assert.match(worker, /XSA_RUNTIME_FILENAME = "cos-university-xsa-runtime\.py"/)
  assert.match(worker, /def _load_xsa_runtime\(\)/)
  assert.match(worker, /worker_xsa_runtime_contract_invalid/)
  assert.match(worker, /worker_xsa_runtime_profile_mismatch/)
  assert.match(worker, /"xsaTrainingRuntimeImplemented": True/)
  assert.match(worker, /"xsaServingRuntimeImplemented": True/)
})

test('durable evidence requires the matching XSA serving runtime before rollout', () => {
  const consumer = source('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  const onboard = source('../../ONBOARD.md')
  assert.match(consumer, /xsaTrainingRuntimeImplemented: boolean\('xsaTrainingRuntimeImplemented'\)/)
  assert.match(consumer, /xsaServingRuntimeImplemented: boolean\('xsaServingRuntimeImplemented'\)/)
  assert.match(onboard, /XSA exact-artifact serving\/evaluation lane/)
  assert.match(onboard, /rollout remains 0%/)
  assert.match(onboard, /Non-zero rollout remains fail-closed/)
})
