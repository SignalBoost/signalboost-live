// saas/tests/cosTurnIntentLane.node.test.ts
//
// The model's reading of the request decides the lane; word rules only suggest one. Production 2026-10-28: a pasted
// notice, a previous analysis and the user's question about his own retirement were sent to the writing setup
// (an unrequested rewrite), to the picture generator ("at any point" typo-corrected to "paint") and to a
// historical-list refusal. The paste below has the same properties without the user's personal text.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isAuthoringObjectiveWithoutLiveLookup } from '../lib/ai/cos/cosReasoningRolePolicy.ts'
import {
  parseCosSemanticTaskIntent,
  semanticIntentConfirmsFile,
  semanticIntentConfirmsPicture,
  semanticIntentConfirmsWriting,
  type CosSemanticTaskIntent,
} from '../lib/ai/cos/cosSemanticTaskIntent.ts'
import { cosTurnIntent, withCosTurnIntent } from '../lib/ai/cos/cosTurnIntent.ts'
import { isConciergeVisualObjective } from '../lib/visuals/intent.ts'

const ADVICE_PASTE = [
  'NOTICE 26-114: Expanded career options for staff officers.',
  'The agency may approve continued service beyond the mandatory retirement age for up to five years when it serves the public interest.',
  '',
  'Previous analysis I received:',
  'My recommendation: request the five-year extension now. You keep the option to retire at any point during the extension.',
  'Draft email to HR: I respectfully request consideration for an extension of up to five years.',
  '',
  'Given this notice and that analysis, what should I do about my retirement next year?',
].join('\n')

const advice: CosSemanticTaskIntent = { mode: 'general_reasoning', confidence: 0.9, suppliedContextPrimary: true, externalFactsRequired: false }
const intent = (mode: CosSemanticTaskIntent['mode'], confidence = 0.9): CosSemanticTaskIntent =>
  ({ mode, confidence, suppliedContextPrimary: true, externalFactsRequired: false })

test('the word rules still suggest writing and a picture for the advice paste, and the judge reading overrules both', () => {
  assert.equal(isAuthoringObjectiveWithoutLiveLookup(ADVICE_PASTE), true)
  assert.equal(isConciergeVisualObjective(ADVICE_PASTE), true)
  assert.equal(semanticIntentConfirmsWriting(advice), false)
  assert.equal(semanticIntentConfirmsPicture(advice), false)
  assert.equal(semanticIntentConfirmsFile(advice), false)
})

test('a special lane runs only on a confident, matching judge reading; an unavailable judge never picks one', () => {
  assert.equal(semanticIntentConfirmsWriting(intent('content_generation')), true)
  assert.equal(semanticIntentConfirmsPicture(intent('visual_generation')), true)
  assert.equal(semanticIntentConfirmsFile(intent('file_generation')), true)
  assert.equal(semanticIntentConfirmsPicture(intent('visual_generation', 0.5)), false)
  assert.equal(semanticIntentConfirmsWriting(intent('visual_generation')), false)
  for (const confirm of [semanticIntentConfirmsWriting, semanticIntentConfirmsPicture, semanticIntentConfirmsFile]) {
    assert.equal(confirm(null), false)
  }
})

test('the judge can answer with the picture and file lanes', () => {
  assert.equal(parseCosSemanticTaskIntent('{"mode":"visual_generation","confidence":0.95,"suppliedContextPrimary":false,"externalFactsRequired":false}')?.mode, 'visual_generation')
  assert.equal(parseCosSemanticTaskIntent('{"mode":"file_generation","confidence":0.95,"suppliedContextPrimary":false,"externalFactsRequired":false}')?.mode, 'file_generation')
})

test('one turn makes one judge decision, shared by the front door and every step inside COS', async () => {
  let calls = 0
  const judge = async () => { calls += 1; return advice }
  const seen = await withCosTurnIntent(async () => {
    const frontDoor = await cosTurnIntent({ input: ADVICE_PASTE }, judge)
    const insideCos = await withCosTurnIntent(() => cosTurnIntent({ input: `PREVIOUS USER CONTEXT:\n...\n\nCURRENT USER REQUEST:\n${ADVICE_PASTE}` }, judge))
    return [frontDoor, insideCos]
  })
  assert.equal(calls, 1)
  assert.deepEqual(seen, [advice, advice])

  await withCosTurnIntent(() => cosTurnIntent({ input: 'next turn' }, judge))
  assert.equal(calls, 2)
})

test('a failing judge leaves the turn with no reading rather than an error', async () => {
  const reading = await withCosTurnIntent(() => cosTurnIntent({ input: ADVICE_PASTE }, async () => { throw new Error('reasoner busy') }))
  assert.equal(reading, null)
})

test('every lane the word rules suggest is gated by the turn decision', () => {
  const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  const answer = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(browser, /&& semanticIntentConfirmsWriting\(await turnIntent\(\)\)\n  if \(fastAuthoringIngress\)/)
  assert.match(browser, /if \(isConciergeArtifactObjective\(prompt\) && semanticIntentConfirmsFile\(await turnIntent\(\)\)\)/)
  assert.match(browser, /isConciergeVisualObjective\(prompt\) && semanticIntentConfirmsPicture\(await turnIntent\(\)\)/)
  assert.equal((browser.match(/withCosTurnIntent\(\(\) => executeBrowserTurn\(req\)\)/g) ?? []).length, 2)
  assert.match(primary, /await withCosTurnIntent\(\(\) => postCosPrimary\(req\)\)/)
  assert.match(primary, /&& semanticIntentConfirmsWriting\(await cosTurnIntent\(/)
  assert.match(primary, /const rosterRequested=rosterSuggested&&semanticIntentRequiresFreshness\(await cosTurnIntent\(/)
  assert.match(browser, /&& prompt\.length <= MAX_VISUAL_OBJECTIVE_CHARS\n/)
  assert.doesNotMatch(primary, /classifyCosSemanticTaskIntent/)
  assert.match(answer, /return semanticIntentConfirmsWriting\(intent\) \? 'cos_interactive_authoring' : 'cos_interactive_answer'/)
})
