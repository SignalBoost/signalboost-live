// saas/tests/labProviderOptions.node.test.ts
// LAB section 2 provider dropdowns, against the real catalog: alphabetical, never empty, selectable only when usable.
import test from 'node:test'
import assert from 'node:assert/strict'
import { LAB_PROVIDER_CATALOG } from '../lib/ai/cos/labCustomerProviderCatalog.ts'
import { providerOptions, sortProviders } from '../lib/lab/labProviderOptions.ts'

test('providers are alphabetical with "Other (OpenAI-compatible)" last', () => {
  const names = sortProviders(LAB_PROVIDER_CATALOG).map(p => p.name)
  assert.deepEqual(names, ['Anthropic', 'DeepInfra', 'DeepSeek', 'Fireworks AI', 'Google Gemini', 'Grok (xAI)', 'GroqCloud', 'Hugging Face',
    'Mistral AI', 'OpenAI', 'OpenRouter', 'Qwen (Alibaba Cloud)', 'Together AI', 'Other (OpenAI-compatible)'])
})

test('with no saved keys every provider is listed, none selectable, each with its reason', () => {
  const training = providerOptions(LAB_PROVIDER_CATALOG, new Set(), 'training.execute')
  assert.equal(training.length, LAB_PROVIDER_CATALOG.length)
  assert.ok(training.every(o => o.blocked !== null))
  assert.deepEqual(training.filter(o => o.blocked === 'needs_key').map(o => o.kind), ['fireworks', 'huggingface', 'together'])
  assert.equal(training.find(o => o.kind === 'anthropic')?.blocked, 'teacher_only')
  const teacher = providerOptions(LAB_PROVIDER_CATALOG, new Set(), 'teacher.generate')
  assert.equal(teacher.length, LAB_PROVIDER_CATALOG.length)
  assert.ok(teacher.every(o => o.blocked === 'needs_key'))
})

test('a saved key makes exactly that provider selectable, only where it can do the job', () => {
  const keys = new Set(['anthropic', 'together'])
  const training = providerOptions(LAB_PROVIDER_CATALOG, keys, 'training.execute')
  assert.deepEqual(training.filter(o => !o.blocked).map(o => o.kind), ['together'])
  assert.equal(training.find(o => o.kind === 'anthropic')?.blocked, 'teacher_only')
  const teacher = providerOptions(LAB_PROVIDER_CATALOG, keys, 'teacher.generate')
  assert.deepEqual(teacher.filter(o => !o.blocked).map(o => o.kind), ['anthropic', 'together'])
})
