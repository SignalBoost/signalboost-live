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

test('trusted runtime context describes the multi-model topology instead of one platform-wide model', () => {
  assert.match(topology, /General COS reasoning model:/)
  assert.match(topology, /Builder \/ Platform Engineer coding-specialist model:/)
  assert.match(topology, /DEEPINFRA_BUILDER_MODEL/)
  assert.match(topology, /deepseek-ai\/DeepSeek-V4-Pro/)
  assert.match(topology, /Qwen\/Qwen3\.6-35B-A3B/)
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
