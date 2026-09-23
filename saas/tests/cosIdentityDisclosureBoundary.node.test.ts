// saas/tests/cosIdentityDisclosureBoundary.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const shared = readFileSync(new URL('../lib/ai/cos/cosFirstAnswer.ts', import.meta.url), 'utf8')
const core = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerCore.ts', import.meta.url), 'utf8')
const enterprise = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
const topology = readFileSync(new URL('../lib/ai/cos/platformIdentityContext.ts', import.meta.url), 'utf8')

test('authenticated owner self-knowledge uses verified deterministic runtime facts before neural fallback', () => {
  assert.match(shared, /const ownerSelfKnowledge = input\.privileged === true/)
  assert.match(shared, /const deterministicSelfKnowledge = await tryCoreCOSFirstAnswer\(input\)/)
  assert.match(shared, /deterministicSelfKnowledge\.handled && coreReleasedCannedOwnerSelfKnowledge/)
  assert.match(shared, /tryOwnerNeuralSelfKnowledge\(input, \{ compatibilitySignal: true \}\)/)
  const deterministic = shared.indexOf('const deterministicSelfKnowledge = await tryCoreCOSFirstAnswer(input)')
  const fallback = shared.indexOf('tryOwnerNeuralSelfKnowledge(input, { compatibilitySignal: true })')
  assert.ok(deterministic >= 0)
  assert.ok(fallback > deterministic, 'neural self-knowledge may only run after deterministic runtime facts fail')
})

test('owner self-knowledge no longer blocks a valid deterministic runtime answer', () => {
  assert.doesNotMatch(shared, /selfKnowledgeDeterministicBlocked/)
  assert.doesNotMatch(shared, /deterministic compatibility answer was blocked rather than released/i)
  assert.match(shared, /return deterministicSelfKnowledge/)
})

test('trusted runtime context reports RunPod primary separately from DeepInfra fallback', () => {
  assert.match(topology, /Preferred COS text compute provider:/)
  assert.match(topology, /RunPod primary reasoning model setting:/)
  assert.match(topology, /DeepInfra\/LOCAL_AI fallback|Controlled LOCAL_AI \/ DeepInfra fallback/)
  assert.match(topology, /DeepInfra Builder fallback model:/)
  assert.match(topology, /RUNPOD_PRIMARY_MODEL/)
  assert.match(topology, /DEEPINFRA_BUILDER_MODEL/)
  assert.match(topology, /LOCAL_AI_MODEL/)
  assert.match(topology, /primaryReasonerModel: controlledLocalModel/)
  assert.match(topology, /preferredPrimaryReasonerModel/)
  // Owner rule 2026-09-03: no hard-coded provider model identifiers may masquerade as runtime facts.
  assert.doesNotMatch(topology, /deepseek-ai\//)
  assert.doesNotMatch(topology, /Qwen\//)
  assert.doesNotMatch(topology, /BAAI\//)
  assert.match(topology, /VERBATIM FACTUAL ATOMS/)
  assert.match(topology, /NOT CONFIGURED/)
  assert.match(topology, /RunPod primary/)
  assert.match(topology, /fallback/)
})

test('public disclosure remains a deterministic safety boundary, separate from owner reasoning', () => {
  assert.match(core, /if \(asksAboutServiceIdentity\(userRequest\)\)/)
  assert.match(core, /publicImplementationDisclosureReply\(input\.language\)/)
  assert.doesNotMatch(enterprise, /publicImplementationDisclosureReply/)
})

test('owner runtime topology remains host-owned and public disclosure stays separate', () => {
  assert.match(core, /selfKnowledgeDeterministic:\s*true/)
  assert.match(core, /function ownerPlatformStackReply/)
  assert.match(core, /currentPlatformModelTopology\(\)/)
  assert.doesNotMatch(core, /LOCAL_AI_MODEL \|\| 'Qwen\//)
  assert.match(enterprise, /PLATFORM TECHNICAL SPECIFICATION \(owner-only\):/)
})
