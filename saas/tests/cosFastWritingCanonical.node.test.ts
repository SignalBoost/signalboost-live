// saas/tests/cosFastWritingCanonical.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isAuthoringObjectiveWithoutLiveLookup, isCosCodingObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'

const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')

const ANNIVERSARY = 'my inlaws today celebrate their wedding 50 aniversary. Please write a nice messsage to them in Polish and show me the english translation'

const MULTILINGUAL_AUTHORING = [
  'Create a warm greeting for my parents for their golden anniversary and give me Polish and English versions.',
  'Napisz ciepłe życzenia dla moich rodziców z okazji złotych godów.',
  'Escreva uma mensagem carinhosa para meus sogros pelas bodas de ouro.',
  'Redacta un mensaje bonito para mis suegros por sus bodas de oro.',
  'Напиши тёплое поздравление моим родителям с золотой свадьбой.',
] as const

test('anniversary writing qualifies for canonical fast authoring and is not coding', () => {
  assert.equal(isAuthoringObjectiveWithoutLiveLookup(ANNIVERSARY), true)
  assert.equal(isCosCodingObjective(ANNIVERSARY), false)
})

test('common human authoring phrasing is not tied to the English routing vocabulary', () => {
  for (const prompt of MULTILINGUAL_AUTHORING) {
    assert.equal(isAuthoringObjectiveWithoutLiveLookup(prompt), true, prompt)
    assert.equal(isCosCodingObjective(prompt), false, prompt)
  }
})

test('production routing has a semantic authoring rescue and does not branch on the anniversary fixture text', () => {
  assert.match(primary, /semanticIntentIsSelfContainedContentGeneration/)
  assert.match(primary, /cos-fast-authoring-semantic-rescue/)
  assert.doesNotMatch(primary, /my inlaws today celebrate their wedding 50 aniversary/i)
})

test('writing requests go straight to COS: fast authoring is never a detour in front of COS', () => {
  // Production 2026-09-27 14:06 ET: two pre-COS fast-authoring detours each burned their full 18s budget and
  // returned nothing before COS answered in 15.5s. runFastAuthoring survives only as the post-COS rescue.
  const auth = primary.indexOf("const access=await timeCosStage('primary:authorization'")
  const enterprise = primary.indexOf('tryCOSFirstAnswer({prompt:reasoningPrompt', auth)
  assert.ok(auth > 0)
  assert.ok(enterprise > auth)
  assert.doesNotMatch(primary, /const fastAuthoringEligible=/, 'dead authoring flag must not force a classifier call on every request')
  const beforeCos = primary.slice(auth, enterprise)
  assert.doesNotMatch(beforeCos, /await runFastAuthoring\(/)
  assert.match(primary.slice(enterprise), /const semanticFast=await runFastAuthoring\(input,language\)/)
  assert.match(primary, /deepseek-ai\/DeepSeek-V4-Flash/)
  assert.match(primary, /FAST_AUTHORING_TIMEOUT_MS = 18_000/)
  assert.match(primary, /FAST_AUTHORING_ATTEMPT_MS = 9_000/)
  assert.match(primary, /usageContext:\{feature:'cos_fast_authoring'/)
  assert.match(primary, /source='cos-fast-authoring'/)
  assert.match(primary, /Respond in \$\{reportLanguageName\(language\)\}/)
})

test('browser direct edits delegate to canonical COS instead of running a competing reasoner', () => {
  assert.doesNotMatch(browser, /tryDirectTextTransformation/)
  const direct = browser.indexOf('if (directTextTransformation && !directTextHasAttachments)')
  const delegate = browser.indexOf('cosPrimaryPost(req)', direct)
  const identity = browser.indexOf('resolveSemanticPublicIdentity(prompt)')
  assert.ok(direct > 0)
  assert.ok(delegate > direct)
  assert.ok(identity > delegate)
})

test('canonical edit lane shares the same bounded interactive budget', () => {
  assert.match(primary, /FAST_TEXT_TRANSFORM_TIMEOUT_MS = 15_000/)
  assert.match(primary, /FAST_TEXT_TRANSFORM_ATTEMPT_MS = 7_000/)
  assert.match(primary, /usageContext:\{feature:'cos_fast_text_transform'/)
})


test('completion-first routing semantically promotes natural research requests to live evidence', () => {
  assert.match(primary, /const semanticTaskIntent=!requestedAction/)
  assert.match(primary, /semanticTaskIntent\.mode==='external_fact_verification'/)
  assert.match(primary, /const semanticRequiresFreshEvidence=Boolean/)
  assert.match(primary, /heuristicRequiresFreshEvidence\|\|semanticRequiresFreshEvidence/)
})

test('ordinary low-confidence answers are completed instead of replaced by the generic refusal', () => {
  assert.match(primary, /completion_first_best_effort/)
  assert.match(primary, /source:'cos-local-best-effort'/)
  assert.match(primary, /runCompletionFirstRescue\(input,language,cosAudience\(isPrivileged\)\)/)
  assert.match(primary, /cos-completion-first-rescue/)
  assert.ok(primary.indexOf('completion_first_best_effort') < primary.indexOf('buildHonestRefusalReply({prompt:input'))
})


test('last-chance analytical rescue checks every numbered deliverable and repairs a partial draft', () => {
  const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  const rescue = primary.slice(primary.indexOf('async function runCompletionFirstRescue'), primary.indexOf('function completionFirstResponse'))
  assert.match(rescue, /requestedAnalyticalTasks\(input\)/)
  assert.match(rescue, /const firstOutcome=await verifyAnswerOutcome\(\{request:input,answer:reply,judge:cosAnswerOutcomeJudge\}\)/)
  assert.match(rescue, /UNDELIVERED ITEMS:/)
  assert.match(rescue, /if\(!answerOutcomeReleasable\(await verifyAnswerOutcome\(\{request:input,answer:candidateReply,judge:cosAnswerOutcomeJudge\}\)\)\)return null/)
  assert.doesNotMatch(rescue, /missingAnalyticalTasks/)
})


test('writing recovery uses owned RunPod first and one governed managed fallback instead of managed-only retries', () => {
  const inference = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  const eligible = inference.slice(inference.indexOf('function interactiveUserResponse('), inference.indexOf('function freshGroundedTask('))
  assert.match(eligible, /feature === 'cos_fast_authoring'/)
  const rescue = primary.slice(primary.indexOf('async function runFastAuthoring('), primary.indexOf("// The agent loop's share"))
  assert.match(rescue, /const turn=await callLocalModelTurn\(\{/)
  assert.match(rescue, /maxEstimatedCostUsd:deepInfraMaxCallUsd\('builder'\)/)
  assert.match(rescue, /const signal=AbortSignal.timeout/)
  assert.match(rescue, /fallbackFromOwned:false/)
  assert.doesNotMatch(rescue, /fallbackFromOwned:true/)
  assert.match(rescue, /const servedModel=String\(turn.model\|\|model\)/)
  assert.match(rescue, /model===preferredModel\?FAST_AUTHORING_TIMEOUT_MS:FAST_AUTHORING_ATTEMPT_MS/)
})

test('missed semantic writing intent gets a bounded correspondence-only recovery with factual gates intact', () => {
  const recovery = primary.slice(primary.indexOf('// If ordinary COS could not complete a non-live'), primary.indexOf('// Last ordinary-task rescue'))
  assert.match(recovery, /const correspondenceDraft=/)
  assert.match(recovery, /draft\|write\|compose/)
  assert.match(recovery, /letter\|email\|e-mail\|message\|memo/)
  assert.match(recovery, /rescueIntent\?\.externalFactsRequired!==true/)
  assert.match(recovery, /rescueIntent\?\.mode!=='clarification_required'/)
  assert.match(recovery, /semanticIntentIsSelfContainedContentGeneration\(rescueIntent\)\|\|correspondenceRescue/)
  assert.match(recovery, /await runFastAuthoring\(input,language\)/)
  assert.match(recovery, /!requestedAction&&\(!requiresFreshEvidence\|\|freshMissUseLocal\)&&!hasAttachments/)
})
