// Q15 regression: drafting dependent on public policy must verify the rule first.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { semanticIntentRequiresFreshness, semanticIntentIsSelfContainedContentGeneration, type CosSemanticTaskIntent } from '../lib/ai/cos/cosSemanticTaskIntent.ts'
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const legalLetter: CosSemanticTaskIntent = { mode: 'content_generation', confidence: 0.98, suppliedContextPrimary: false, externalFactsRequired: true }
const selfContainedLetter: CosSemanticTaskIntent = { mode: 'content_generation', confidence: 0.98, suppliedContextPrimary: true, externalFactsRequired: false }

test('a legal-fact-dependent letter requires evidence; a self-contained letter does not', () => {
  assert.equal(semanticIntentRequiresFreshness(legalLetter), true)
  assert.equal(semanticIntentIsSelfContainedContentGeneration(legalLetter), false)
  assert.equal(semanticIntentRequiresFreshness(selfContainedLetter), false)
  assert.equal(semanticIntentIsSelfContainedContentGeneration(selfContainedLetter), true)
})

test('browser and primary fast-authoring lanes exclude factual writing', () => {
  const browser = read('app/api/cos-browser/route.ts')
  const primary = read('app/api/cos-primary/route.ts')
  assert.match(browser, /&& !\(await turnIntent\(\)\)\?\.externalFactsRequired/)
  assert.doesNotMatch(browser, /isAuthoringObjectiveWithoutLiveLookup/)
  assert.match(browser, /semanticIntentConfirmsWriting\(await turnIntent\(\)\)/)
  assert.doesNotMatch(primary, /const fastAuthoringEligible=/)
  assert.match(primary, /semanticIntentRequiresFreshness\(semanticTaskIntent\)/)
  assert.match(primary, /const semanticTaskIntentNeeded=!requestedAction[\s\S]{0,240}isAuthoringObjectiveWithoutLiveLookup\(input\)/)
})

test('an inquiry-only draft does not need external policy verification', () => {
  const judge = read('lib/ai/cos/cosSemanticTaskIntent.ts')
  assert.match(judge, /classify the OUTPUT the user wants/)
  assert.match(judge, /Questions such as whether it is true, whether it applies, and what process to follow belong INSIDE the correspondence/)
  assert.match(judge, /content_generation with externalFactsRequired=false/)
  assert.match(judge, /Only mark content_generation with externalFactsRequired=true when producing the requested document itself requires COS to assert/)
  assert.match(judge, /Resolve this by meaning and addressee/)
})

test('the writing rescue is not bypassed just because COS previously identified a writing intent', () => {
  const primary = read('app/api/cos-primary/route.ts')
  const start = primary.indexOf('// If ordinary COS could not complete a non-live')
  const end = primary.indexOf('// Last ordinary-task rescue', start)
  assert.ok(start >= 0 && end > start)
  const rescue = primary.slice(start, end)
  assert.doesNotMatch(rescue, /&&!fastAuthoringEligible/)
  assert.match(rescue, /semanticIntentIsSelfContainedContentGeneration\(rescueIntent\)/)
  assert.match(rescue, /await runFastAuthoring\(input,language\)/)
})

test('inquiry drafting keeps the recipient responsible for confirmation; explicit outside research remains distinct', () => {
  const judge = read('lib/ai/cos/cosSemanticTaskIntent.ts')
  const verifier = read('lib/ai/cos/answerOutcomeVerifier.ts')
  const authoring = read('lib/ai/cos/cosFirstAnswerEnterprise.ts')
  const primary = read('app/api/cos-primary/route.ts')
  assert.match(judge, /COS for its own factual determination or advice SEPARATELY/)
  assert.match(verifier, /Do not invent a second deliverable or reject the draft/)
  assert.match(verifier, /user unmistakably asks COS itself to verify/)
  assert.match(authoring, /put those questions in the sendable letter/)
  assert.match(primary, /IS a complete drafting task/)
  assert.match(primary, /verifyAnswerOutcome\(\{request:input,answer:reply,judge:cosAnswerOutcomeJudge\}\)/)
  const browser = read('app/api/cos-browser/route.ts')
  assert.match(browser, /semanticIntentConfirmsWriting\(await turnIntent\(\)\)/)
  assert.match(browser, /externalFactsRequired/)
})
