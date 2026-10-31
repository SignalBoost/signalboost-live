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
  assert.match(primary, /&& !\(await cosTurnIntent\(/)
  assert.match(primary, /const semanticTaskIntentNeeded=!requestedAction[\s\S]{0,240}isAuthoringObjectiveWithoutLiveLookup\(input\)/)
})

test('the judge explicitly distinguishes a drafting deliverable from its factual dependencies', () => {
  const judge = read('lib/ai/cos/cosSemanticTaskIntent.ts')
  assert.match(judge, /When requested writing depends on establishing an outside-world fact/)
  assert.match(judge, /When the user requests both a draft and advice, preserve both deliverables/)
})


test('uncertain-policy inquiries are drafted without turning the rumor into a verified benefit', () => {
  const judge = read('lib/ai/cos/cosSemanticTaskIntent.ts')
  assert.match(judge, /simply a letter asking a recipient whether a rumored policy or benefit exists/)
  assert.match(judge, /questions intended for the letter's recipient as separate requests/)
  assert.match(judge, /user separately asks COS for factual legal, medical, financial, policy, or eligibility advice/)
})

test('self-contained writing reaches the existing authoring rescue after the first COS attempt returns no draft', () => {
  const primary = read('app/api/cos-primary/route.ts')
  const start = primary.indexOf('// If ordinary COS could not complete a non-live')
  const stop = primary.indexOf('// Last ordinary-task rescue', start)
  assert.ok(start >= 0 && stop > start)
  const rescue = primary.slice(start, stop)
  assert.match(rescue, /semanticIntentIsSelfContainedContentGeneration\(rescueIntent\)/)
  assert.match(rescue, /await runFastAuthoring\(input,language\)/)
  assert.doesNotMatch(rescue, /&&!fastAuthoringEligible/)
  assert.ok(primary.indexOf('tryCOSFirstAnswer({prompt:reasoningPrompt') < start)
  assert.ok(stop < primary.indexOf('buildHonestRefusalReply({prompt:input'))
})
