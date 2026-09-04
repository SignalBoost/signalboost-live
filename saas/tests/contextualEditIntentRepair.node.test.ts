// saas/tests/contextualEditIntentRepair.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { contextualEditIntentViolation, repairContextualEditDrift } from '../lib/ai/cos/contextualEditQuality.ts'

const SOURCE = readFileSync(join(process.cwd(), 'lib/ai/cos/directTextTransformation.ts'), 'utf8')

// A referral-only source whose edit wrongly asks the recipient to supply the status itself.
const REFERRAL_SOURCE = 'Hi Dana, who should I contact about the REA posting? Thank you'
const EXPANDED_DRAFT = 'Hi Dana, could you please provide the status of the REA posting? Thank you'

test('the expansion this branch guards against is genuinely detected', () => {
  assert.equal(contextualEditIntentViolation({ originalSource: REFERRAL_SOURCE, answer: EXPANDED_DRAFT }), 'recipient_role_expansion')
})

test('a faithful referral-only edit is not flagged', () => {
  const faithful = 'Hi Dana,\n\nCould you point me to the person who handles the REA posting?\n\nThank you'
  assert.equal(contextualEditIntentViolation({ originalSource: REFERRAL_SOURCE, answer: faithful }), null)
})

test('a violation now triggers a bounded repair before any discard', () => {
  assert.match(SOURCE, /REPAIR THE VIOLATION, DO NOT DISCARD THE EDIT/)
  assert.match(SOURCE, /You are COS repairing ONE scope error/)
})

test('the discard is reachable only after the repair has also failed', () => {
  const branch = SOURCE.slice(SOURCE.indexOf('REPAIR THE VIOLATION'))
  const repairIndex = branch.indexOf('const intentRepair = await callCosReasoner')
  const discardIndex = branch.indexOf('finalAnswer = normalizeTextTransformationPresentation(editableSource.trim())')
  assert.ok(repairIndex > -1, 'bounded repair call must exist')
  assert.ok(discardIndex > repairIndex, 'the discard must come after the repair attempt')
  assert.match(branch, /Last resort only, once the bounded repair has also failed/)
})

test('the repair result is revalidated before release', () => {
  const branch = SOURCE.slice(SOURCE.indexOf('REPAIR THE VIOLATION'))
  assert.match(branch, /!contextualEditIntentViolation\(\{ originalSource: rawEditableSource, answer: repairedAnswer \}\)/)
})

test('the repair instruction forbids re-proofreading the untouched sentences', () => {
  assert.match(SOURCE, /Every other sentence must survive word for word/)
  assert.match(SOURCE, /Do not restore rough source wording elsewhere/)
})

test('the deterministic drift pass still runs on the repaired draft', () => {
  const branch = SOURCE.slice(SOURCE.indexOf('REPAIR THE VIOLATION'))
  assert.match(branch, /repairContextualEditDrift\(\{/)
})

test('the drift repair leaves a clean non-English draft unchanged', () => {
  const spanish = 'Hola Dana,\n\n¿Podrías indicarme quién puede darme el estado de la vacante REA?\n\nGracias'
  assert.equal(repairContextualEditDrift({ originalSource: REFERRAL_SOURCE, referenceContext: null, answer: spanish, language: 'es' }), spanish)
})
