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

test('owner-approved platform glossary reaches only the owner audience of the one COS pipeline', async () => {
  const glossary = await import('../lib/ai/cos/cosPlatformGlossary.ts')
  const context = glossary.ownerPlatformGlossaryContext()
  for (const term of ['COS (Chief of Staff)', 'Concierge', 'COS University', 'Specialist', 'Artifact', 'Graduate', 'Builder Residency']) {
    assert.match(context, new RegExp(term.replace(/[()]/g, '\\$&')))
  }
  assert.match(context, /owner channel only/)

  // Current request only: a wrapped follow-up is judged by what the owner is asking now.
  assert.equal(glossary.mentionsPlatformConcept('What is the University?'), true)
  assert.equal(glossary.mentionsPlatformConcept('What is a specialist?'), true)
  assert.equal(glossary.mentionsPlatformConcept('PREVIOUS USER CONTEXT:\nWhat is the University?\n\nCURRENT USER REQUEST:\nTranslate hello to Spanish'), false)
  assert.equal(glossary.mentionsPlatformConcept('Translate hello to Spanish'), false)

  // One pipeline: the glossary lives in the owner audience block of the single COS answer prompt.
  const audienceAt = enterprise.indexOf('function audienceSection(')
  const ownerAt = enterprise.indexOf("if (audience === 'owner') return [", audienceAt)
  const glossaryAt = enterprise.indexOf('ownerPlatformGlossaryContext()', ownerAt)
  const publicAt = enterprise.indexOf("if (audience === 'public') return [", audienceAt)
  assert.ok(audienceAt > 0 && publicAt > audienceAt && ownerAt > publicAt && glossaryAt > ownerAt)
  assert.ok(enterprise.slice(publicAt, ownerAt).indexOf('ownerPlatformGlossaryContext') < 0, 'public audience must not receive the glossary')
  assert.doesNotMatch(core, /ownerPlatformGlossaryContext|OWNER_PLATFORM_GLOSSARY/)
  assert.doesNotMatch(shared, /platformConcept: true/, 'no separate platform-concept reasoner lane')

  // Platform-concept questions from the owner are never diverted into previous-turn interpretation.
  const interpretation = shared.indexOf('async function tryNeuralContextualInterpretation')
  const bypass = shared.indexOf('if (input.privileged === true && !isPublicDeliveryScope() && mentionsPlatformConcept(prompt)) return null', interpretation)
  assert.ok(interpretation > 0 && bypass > interpretation)
})

test('every audience gets the approved company identity in the prompt for company questions', () => {
  // Production 2026-09-26: the owner channel answered "iTMounts is not a recognized product" while
  // Concierge, whose separate pipeline carried this block, answered correctly. One pipeline, one block.
  const blockAt = enterprise.indexOf('function companyKnowledgeBlock(prompt:string):string {')
  const block = enterprise.slice(blockAt, enterprise.indexOf('export async function tryCOSFirstAnswer(', blockAt))
  assert.match(block, /if \(!isSignalBoostSpecificPublicRequest\(prompt\)\) return ''/)
  assert.match(block, /COMPANY IDENTITY \(owner-approved; authoritative for this question/)
  assert.match(block, /\$\{SIGNALBOOST_COMPANY_IDENTITY_DEFINITION\}/)
  assert.match(block, /PUBLIC PRODUCT CATALOG/)
  const promptAt = enterprise.indexOf('prompt:`${companyKnowledgeBlock(input.prompt)}')
  const userInput = enterprise.indexOf('CURRENT USER INPUT (QUESTION, STATEMENT, OR PASTED TEXT)', promptAt)
  assert.ok(promptAt > blockAt && userInput > promptAt)
  assert.match(enterprise, /The product you serve is iTMounts \(itmounts\.com\)/)
})

test('the completion rescue lane carries the same COS identity and company knowledge', () => {
  // Production 2026-09-27 04:36–04:38 UTC: both owner and Concierge answers to "What is iTMounts?" came
  // from the completion rescue, a model call with no identity ("a typo for iMounts").
  const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  const rescueAt = primary.indexOf('async function runCompletionFirstRescue(input:string,language:string,audience:CosAudience)')
  const rescue = primary.slice(rescueAt, primary.indexOf('function completionFirstResponse(', rescueAt))
  assert.ok(rescueAt > 0)
  assert.match(rescue, /cosIdentityPreamble\(audience\)/)
  assert.match(rescue, /prompt:`\$\{companyKnowledgeBlock\(input\)\}\$\{input\}`/)
  assert.match(primary, /runCompletionFirstRescue\(input,language,cosAudience\(isPrivileged\)\)/)
  assert.match(enterprise, /export function cosIdentityPreamble\(audience:CosAudience\):string \{/)
  assert.match(enterprise, /You are COS, the reasoning brain of iTMounts \(itmounts\.com\)/)
})
