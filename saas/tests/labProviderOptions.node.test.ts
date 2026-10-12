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

test('with no saved keys every capable provider is still selectable; only teacher-only ones are disabled', () => {
  const training = providerOptions(LAB_PROVIDER_CATALOG, new Set(), 'training.execute')
  assert.equal(training.length, LAB_PROVIDER_CATALOG.length)
  assert.deepEqual(training.filter(o => !o.blocked).map(o => o.kind), ['fireworks', 'huggingface', 'together'])
  assert.ok(training.every(o => o.hasKey === false))
  assert.equal(training.find(o => o.kind === 'anthropic')?.blocked, 'teacher_only')
  const teacher = providerOptions(LAB_PROVIDER_CATALOG, new Set(), 'teacher.generate')
  assert.equal(teacher.length, LAB_PROVIDER_CATALOG.length)
  assert.ok(teacher.every(o => o.blocked === null))
})

test('a saved key only changes the label; capability alone decides what can be picked', () => {
  const keys = new Set(['anthropic', 'together'])
  const training = providerOptions(LAB_PROVIDER_CATALOG, keys, 'training.execute')
  assert.deepEqual(training.filter(o => o.hasKey).map(o => o.kind), ['anthropic', 'together'])
  assert.equal(training.find(o => o.kind === 'anthropic')?.blocked, 'teacher_only')
  assert.equal(training.find(o => o.kind === 'huggingface')?.blocked, null)
})

test('account dropdowns add a key inline and select it once saved; Hugging Face models load without a key', async () => {
  const { readFileSync } = await import('node:fs')
  const { LAB_CUSTOMER_TRAINING_COPY } = await import('../lib/i18n/labCustomerTrainingCopy.ts')
  const panel = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')
  const models = readFileSync(new URL('../app/api/lab/models/route.ts', import.meta.url), 'utf8')
  assert.match(panel, /<option value=\{ADD_KEY_OPTION\}>\{copy\.addKeyOption\}<\/option>/)
  assert.match(panel, /if \(event\.target\.value === ADD_KEY_OPTION\) \{ openInlineKey\('training', computeProviderKind\); return \}/)
  assert.match(panel, /if \(event\.target\.value === ADD_KEY_OPTION\) \{ openInlineKey\('teacher', teacherProviderKind\); return \}/)
  assert.match(panel, /else \{ setComputeId\(saved\.credentialId\)/)
  assert.match(panel, /if \(target === 'teacher'\) \{ setTeacherId\(saved\.credentialId\)/)
  assert.match(panel, /openInlineKey\(target, kind && !credentials\.some\(item => item\.providerKind === kind\) \? kind : ''\)/)
  assert.match(panel, /const PUBLIC_MODEL_DIRECTORY = new Set\(\['huggingface'\]\)/)
  assert.match(models, /if \(!credentialId && provider === 'huggingface'\)/)
  assert.match(models, /itmounts_lab_customer_list_credentials/)
  for (const copy of Object.values(LAB_CUSTOMER_TRAINING_COPY)) assert.ok(copy.addKeyOption && copy.cancel && copy.addKeyFirst)
})

test('locked dropdowns say which step they wait for, in every language', async () => {
  const { readFileSync } = await import('node:fs')
  const { LAB_CUSTOMER_TRAINING_COPY } = await import('../lib/i18n/labCustomerTrainingCopy.ts')
  const panel = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /teacherProviderKind \? copy\.chooseTeacherAccount : copy\.chooseProviderFirst/)
  assert.match(panel, /computeProviderKind \? copy\.chooseTrainingAccount : copy\.chooseProviderFirst/)
  assert.match(panel, /!teacherProviderKind \? copy\.chooseProviderFirst : !teacherId \? copy\.chooseAccountFirst : copy\.choose/)
  assert.match(panel, /!computeProviderKind \? copy\.chooseProviderFirst : !computeId && !PUBLIC_MODEL_DIRECTORY\.has\(computeProviderKind\) \? copy\.chooseAccountFirst : copy\.choose/)
  for (const copy of Object.values(LAB_CUSTOMER_TRAINING_COPY)) {
    assert.ok(copy.chooseProviderFirst && copy.chooseAccountFirst)
    assert.notEqual(copy.chooseProviderFirst, copy.chooseAccountFirst)
  }
})
