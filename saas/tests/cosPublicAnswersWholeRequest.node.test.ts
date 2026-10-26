// saas/tests/cosPublicAnswersWholeRequest.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { asksAboutServiceIdentity, publicDisclosureViolations } from '../lib/ai/cos/publicDisclosureGate.ts'

const core = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerCore.ts', import.meta.url), 'utf8')

test('ordinary public requests that mention models or providers match the identity word rule', () => {
  // Production 2026-10-26: requests like these got the fixed "not public" reply instead of an answer.
  for (const request of [
    'Write a blog post about which AI models power modern chatbots.',
    'Report which provider runs each request in the inference routing test.',
  ]) assert.equal(asksAboutServiceIdentity(request), true, request)
})

test('so the public path never decides from that rule; it reasons the request and gates the answer', () => {
  const publicAt = core.indexOf('if (isPublicDeliveryScope()) {\n    // ONE COS PIPELINE')
  const reason = core.indexOf('const brain = await tryEnterpriseCOSFirstAnswer(input)', publicAt)
  assert.ok(publicAt > 0 && reason > publicAt)
  assert.doesNotMatch(core.slice(publicAt, reason), /asksAboutServiceIdentity/)
  // The only earlier identity intercept is owner-scoped.
  const intercepts = [...core.matchAll(/asksAboutServiceIdentity\(input\.prompt\)/g)].map(match => match.index!)
  assert.equal(intercepts.length, 1)
  assert.match(core.slice(intercepts[0]! - 120, intercepts[0]!), /if \(!isPublicDeliveryScope\(\) && /)
})

test('the answer-side gate still catches a public answer that names its own model or vendor', () => {
  assert.ok(publicDisclosureViolations('I am a large language model, trained by Google.').includes('model_self_attribution'))
  assert.ok(publicDisclosureViolations('This assistant is powered by Qwen running on RunPod.').length > 0)
  assert.deepEqual(publicDisclosureViolations('Popular chatbots use models such as Llama, Qwen and GPT-4.'), [])
})
