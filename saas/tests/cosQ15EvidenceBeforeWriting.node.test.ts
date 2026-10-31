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

test('an inquiry-only draft preserves uncertainty without first establishing entitlement', () => {
  const judge = read('lib/ai/cos/cosSemanticTaskIntent.ts')
  assert.match(judge, /drafting an inquiry that explicitly asks the recipient whether a rumored entitlement exists/)
  assert.match(judge, /unless the user separately asks COS to determine whether it is true/)
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
