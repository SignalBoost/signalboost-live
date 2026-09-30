import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { captureServedInference } from '../lib/ai/local-inference.ts'
import { servedReasonerLabel } from '../lib/ai/cos/cosReasoner.ts'
import { reasonerProvenanceLine } from '../lib/ai/cos/reasonerHostingDisclosure.ts'

test('provenance names the provider that actually served the answer, not the configured one', () => {
  const label = servedReasonerLabel('managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B', [{ provider: 'runpod', model: 'qwen3:30b' }])
  assert.equal(label, 'managed-open-model:runpod:qwen3:30b')
  assert.match(reasonerProvenanceLine(label), /Inference Host {9}: runpod\./)
  assert.equal(servedReasonerLabel('managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B', [{ provider: 'deepinfra', model: 'Qwen/Qwen3.6-35B-A3B' }, { provider: 'runpod', model: 'qwen3:30b' }]), 'managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B')
  assert.equal(servedReasonerLabel('managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B', []), 'managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B')
  assert.equal(servedReasonerLabel('independent-local:qwen3:30b', [{ provider: 'runpod', model: 'qwen3:30b' }]), 'independent-local:qwen3:30b')
})

test('served-provider capture is scoped to one reasoning call', async () => {
  const outer = await captureServedInference(async () => 'done')
  assert.deepEqual(outer, { result: 'done', served: [] })
  const source = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  assert.equal(source.split('noteServedInference(provider, model)').length - 1, 2, 'both successful completion returns record the served provider')
  const reasoner = readFileSync(new URL('../lib/ai/cos/cosReasoner.ts', import.meta.url), 'utf8')
  assert.match(reasoner, /captureServedInference\(\(\) => reasonThroughCosControlPlane\(/)
  assert.match(reasoner, /label: servedReasonerLabel\(execution\.worker\.label, served\)/)
})
