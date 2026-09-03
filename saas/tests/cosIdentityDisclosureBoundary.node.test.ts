// saas/tests/cosIdentityDisclosureBoundary.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const shared = readFileSync(new URL('../lib/ai/cos/cosFirstAnswer.ts', import.meta.url), 'utf8')
const core = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerCore.ts', import.meta.url), 'utf8')
const enterprise = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
const topology = readFileSync(new URL('../lib/ai/cos/platformIdentityContext.ts', import.meta.url), 'utf8')

test('authenticated owner self-knowledge is decided and answered by neural semantic reasoning', () => {
  assert.match(shared, /async function tryOwnerNeuralSelfKnowledge/)
  assert.match(shared, /callCosReasoner\(\{/)
  assert.match(shared, /ownerPlatformIdentityContext\(\)/)
  assert.match(shared, /Use neural semantic reasoning over the complete request/)
  assert.match(shared, /Do not use keyword rules, regex intent matching, canned replies, or answer templates/)
  assert.match(shared, /Distinguish the general COS reasoner from Builder\/Platform Engineer coding specialization/)
})

test('the active owner entrypoint does not define or release a canned model/spec answer', () => {
  assert.doesNotMatch(shared, /function ownerPlatformStackReply/)
  assert.doesNotMatch(shared, /selfKnowledgeDeterministic:\s*true/)
  assert.match(shared, /coreReleasedCannedOwnerSelfKnowledge/)
  assert.match(shared, /selfKnowledgeDeterministicBlocked:\s*true/)
  assert.match(shared, /The deterministic compatibility answer was blocked rather than released/)
})

test('trusted owner topology comes only from runtime configuration and never committed model names', () => {
  assert.match(topology, /General COS reasoning model:/)
  assert.match(topology, /Builder \/ Platform Engineer coding-specialist model:/)
  assert.match(topology, /configuredValue\('LOCAL_AI_MODEL'\)/)
  assert.match(topology, /configuredValue\('DEEPINFRA_BUILDER_MODEL'\)/)
  assert.match(topology, /configuredValue\('LOCAL_AI_EMBEDDING_MODEL'\)/)
  assert.match(topology, /configuredValue\('LOCAL_AI_MANAGED_PROVIDER'\)/)
  assert.match(topology, /Do not alter, expand, abbreviate, infer, or version-complete any identifier/)
  assert.doesNotMatch(topology, /Qwen\//)
  assert.doesNotMatch(topology, /DeepSeek/)
  assert.doesNotMatch(topology, /BAAI\//)
  assert.match(topology, /it does not replace the/)
  assert.match(topology, /general COS reasoner/)
})

test('public disclosure remains a deterministic safety boundary, separate from owner reasoning', () => {
  assert.match(core, /if \(asksAboutServiceIdentity\(userRequest\)\)/)
  assert.match(core, /publicImplementationDisclosureReply\(input\.language\)/)
  assert.doesNotMatch(enterprise, /publicImplementationDisclosureReply/)
})

test('both legacy owner hardcode paths are identifiable so the active entrypoint can block them', () => {
  assert.match(core, /selfKnowledgeDeterministic:\s*true/)
  assert.match(core, /function ownerPlatformStackReply/)
  assert.match(enterprise, /PLATFORM TECHNICAL SPECIFICATION \(owner-only\):/)
  const neuralAttempt = shared.indexOf('tryOwnerNeuralSelfKnowledge(input)')
  const coreAttempt = shared.indexOf('tryCoreCOSFirstAnswer(input)')
  assert.ok(neuralAttempt >= 0, 'neural owner self-knowledge attempt must exist')
  assert.ok(coreAttempt > neuralAttempt, 'neural semantic reasoning must run before compatibility core')
})
