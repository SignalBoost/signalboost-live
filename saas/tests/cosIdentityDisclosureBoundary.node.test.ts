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

test('both legacy owner hardcode paths are identifiable so the active entrypoint can block them', () => {
  assert.match(core, /selfKnowledgeDeterministic:\s*true/)
  assert.match(core, /function ownerPlatformStackReply/)
  assert.match(enterprise, /PLATFORM TECHNICAL SPECIFICATION \(owner-only\):/)
  const neuralAttempt = shared.indexOf('tryOwnerNeuralSelfKnowledge(input)')
  const coreAttempt = shared.indexOf('tryCoreCOSFirstAnswer(input)')
  assert.ok(neuralAttempt >= 0, 'neural owner self-knowledge attempt must exist')
  assert.ok(coreAttempt > neuralAttempt, 'neural semantic reasoning must run before compatibility core')
})
