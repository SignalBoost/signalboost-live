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

test('interactive COS answers run with hidden thinking off so they finish inside the interactive timeout', () => {
  // Production 2026-09-27: owner answers failed at ~22-28s (20s interactive model timeout) with thinking on.
  const callAt = enterprise.indexOf("usageContext:{ feature:interactiveReasonerFeature(input.prompt), purpose:'user_facing_response' },")
  const call = enterprise.slice(callAt, enterprise.indexOf('systemPrompt:COS_REASONER_SYSTEM_PROMPT(', callAt))
  assert.ok(callAt > 0)
  assert.match(call, /disableThinking:true,/)
  const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  const rescue = primary.slice(primary.indexOf('async function runCompletionFirstRescue('), primary.indexOf('function completionFirstResponse('))
  assert.match(rescue, /disableThinking:true,/)
})

test('chat answers are short by default in both the main COS call and the rescue lane', () => {
  // Production 2026-09-27 02:14-02:45 ET: one-line questions produced 1,311-1,376 output tokens (~36s at
  // ~37 tokens/s), so the main call missed its 20s limit and every answer took about a minute.
  assert.match(enterprise, /export const CHAT_ANSWER_LENGTH_RULE = 'CHAT ANSWER LENGTH: this is a live chat/)
  assert.match(enterprise, /about 150 words or fewer/)
  const promptAt = enterprise.indexOf('export function COS_REASONER_SYSTEM_PROMPT(')
  const prompt = enterprise.slice(promptAt, enterprise.indexOf("'SELF-KNOWLEDGE AND IMPROVEMENT BOUNDARIES:'", promptAt))
  assert.ok(promptAt > 0)
  assert.match(prompt, /\n    CHAT_ANSWER_LENGTH_RULE,\n/)
  const preambleAt = enterprise.indexOf('export function cosIdentityPreamble(audience:CosAudience):string {')
  const preamble = enterprise.slice(preambleAt, enterprise.indexOf('\n}\n', preambleAt))
  assert.match(preamble, /CHAT_ANSWER_LENGTH_RULE,/)
})

test('internal context sources are retrieved concurrently, before the semantic cache check', () => {
  // Production 2026-09-27 10:31/10:53 ET (cos_ai_roi_metrics): a semantic-cache hit took 7.5-9.5s because five
  // independent context sources were read one after another before the cache could be checked.
  const retrievalAt = enterprise.indexOf('async function retrieveInternalContext(')
  const retrieval = enterprise.slice(retrievalAt, enterprise.indexOf('\nfunction executionFunnel(', retrievalAt))
  assert.ok(retrievalAt > 0)
  for (const stage of ['knowledgeStage', 'enterpriseStage', 'userMemoryStage', 'creativeStage', 'skillStage']) {
    assert.match(retrieval, new RegExp(`const ${stage} = timedRetrievalStage\\('${stage}', async \\(\\) => \\{`))
  }
  assert.match(retrieval, /await Promise\.all\(\[knowledgeStage, enterpriseStage, userMemoryStage, creativeStage, skillStage\]\)/)
  // Systems keep the original sequential order so provenance is unchanged.
  assert.match(retrieval, /systems\.push\(\.\.\.kgSystems, \.\.\.enterpriseSystems, \.\.\.userSystems, \.\.\.creativeSystems, \.\.\.skillSystems\)/)
  // No stage may await another stage's work inline any more.
  assert.doesNotMatch(retrieval, /\n  const creative = await retrieveCreativeMemory\(/)
})


test('every chat stage in front of the answer records its duration for the owner to query', () => {
  const stages = readFileSync(new URL('../lib/ai/cos/cosLatencyStages.ts', import.meta.url), 'utf8')
  assert.match(stages, /task_id: COS_LATENCY_STAGE_TASK_ID/)
  assert.match(stages, /export const COS_LATENCY_STAGE_TASK_ID = 'cos-latency-stage'/)
  assert.match(enterprise, /return run\(\)\.finally\(\(\) => recordCosLatencyStage\(`retrieval:\$\{stage\}`, Date\.now\(\) - startedAt\)\)/)
  const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(browser, /recordCosLatencyStage\(`\$\{browserSurface\}:planner`, Date\.now\(\) - plannerStartedAt\)/)
  assert.match(browser, /recordCosLatencyStage\(`\$\{browserSurface\}:before_cos`, Date\.now\(\) - ingressStartedAt\)/)
  assert.match(browser, /recordCosLatencyStage\(`\$\{browserSurface\}:total`, Date\.now\(\) - ingressStartedAt\)/)
  const independence = readFileSync(new URL('../app/api/admin/cos-independence/route.ts', import.meta.url), 'utf8')
  assert.match(independence, /\.neq\('task_id', 'cos-latency-stage'\)/)
})

test('lexical context fallbacks run concurrently under their own budget and never commit late', () => {
  // Production 2026-09-27 13:30 ET: retrieval:knowledgeStage took 9,428ms while every other source took <=558ms;
  // the semantic lookups were already capped at 1.5s, so the uncapped lexical fallbacks held the rest.
  assert.match(enterprise, /process\.env\.COS_CONTEXT_FALLBACK_BUDGET_MS \|\| '2500'/)
  const helperAt = enterprise.indexOf('async function boundedContextFallback(')
  const helper = enterprise.slice(helperAt, enterprise.indexOf('\n}\n', helperAt))
  assert.ok(helperAt > 0)
  assert.match(helper, /if \(outcome === timedOut\) \{[\s\S]*return\n  \}/)
  assert.match(helper, /if \(outcome\) outcome\(\)/)
  const stageAt = enterprise.indexOf("const knowledgeStage = timedRetrievalStage('knowledgeStage'")
  const stage = enterprise.slice(stageAt, enterprise.indexOf("const enterpriseStage = timedRetrievalStage('enterpriseStage'", stageAt))
  assert.match(stage, /fallbacks\.push\(boundedContextFallback\('kg_lexical'/)
  assert.match(stage, /fallbacks\.push\(boundedContextFallback\('learned_lexical'/)
  assert.match(stage, /await Promise\.all\(fallbacks\)/)
  // Fallback work may not write shared context directly; it returns a commit applied only in budget.
  const kgWork = stage.slice(stage.indexOf("boundedContextFallback('kg_lexical'"), stage.indexOf('return () => {', stage.indexOf("boundedContextFallback('kg_lexical'")))
  assert.doesNotMatch(kgWork, /facts\.push\(/)
  const learnedWork = stage.slice(stage.indexOf("boundedContextFallback('learned_lexical'"), stage.indexOf('return () => {', stage.indexOf("boundedContextFallback('learned_lexical'")))
  assert.doesNotMatch(learnedWork, /learned\.push\(/)
})

test('cos-primary records each step between ingress and the COS answer', () => {
  // Production 2026-09-27 13:42 ET: 18s passed between the semantic-intent call and the first COS context
  // read with no recorded step. Every await in that span now writes a cos-latency-stage row.
  const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.match(primary, /if\(semanticTaskIntentNeeded\)recordCosLatencyStage\('primary:semantic_intent',Date\.now\(\)-semanticIntentStartedAt\)/)
  for (const stage of ['web_search', 'web_page_reads', 'travel_planner', 'strategy_profile', 'conversation_recall', 'cos_first_answer', 'completion_rescue', 'legacy_concierge']) {
    assert.match(primary, new RegExp(`timeCosStage\\('primary:${stage}',`))
  }
  assert.match(primary, /recordCosLatencyStage\('primary:before_cos_first',Date\.now\(\)-startedAt\)/)
  const stages = readFileSync(new URL('../lib/ai/cos/cosLatencyStages.ts', import.meta.url), 'utf8')
  assert.match(stages, /export async function timeCosStage<T>\(stage: string, work: \(\) => Promise<T>\): Promise<T> \{/)
  assert.match(stages, /\} finally \{\n    recordCosLatencyStage\(stage, Date\.now\(\) - startedAt\)/)
})
