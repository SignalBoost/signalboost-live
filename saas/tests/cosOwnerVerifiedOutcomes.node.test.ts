// saas/tests/cosOwnerVerifiedOutcomes.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  COS_OWNER_VERIFIED_SUBJECTS_PROFILE,
  decideOwnerVerifiedOutcome,
  subjectsForVerifiedRequest,
  verifiedTurnSubjectsFromLedger,
} from '../lib/ai/cos/cosOwnerVerifiedOutcomePolicy.ts'

const file = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const turnId = '11111111-2222-4333-8444-555555555555'
const now = new Date('2026-09-16T12:00:00Z')
const turn = (prompt: string, answeredAt = '2026-09-15T12:00:00Z') => ({ exists: true, userPrompt: prompt, answeredAt })
const request = { turnId, outcome: 'success' as const, evidenceRef: 'https://example.com/board-minutes/2026-09-15', summary: 'The board adopted the recommended coalition-risk framing in its filed policy memo.' }

test('subjects come from the request text, reaching the subjects problem_class collapsed', () => {
  assert.deepEqual(subjectsForVerifiedRequest('Analyze how the Senate coalition negotiations could affect EU foreign policy'), ['politics_government_international_relations'])
  assert.deepEqual(subjectsForVerifiedRequest('Explain the historical causes of the Protestant Reformation'), ['history_culture_philosophy_religion'])
  assert.deepEqual(subjectsForVerifiedRequest('Design a quantum error correction approach for a 50-qubit processor'), ['quantum_computing'])
  assert.deepEqual(subjectsForVerifiedRequest('hello there'), [])
})

test('a real owned turn with evidence and a written outcome is accepted, success or failure', () => {
  const ok = decideOwnerVerifiedOutcome({ request, turn: turn('Analyze the Senate coalition and EU foreign policy'), alreadyVerified: false, now })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.ok && ok.subjects, ['politics_government_international_relations'])
  const failed = decideOwnerVerifiedOutcome({ request: { ...request, outcome: 'failure' }, turn: turn('Analyze the Senate coalition and EU foreign policy'), alreadyVerified: false, now })
  assert.equal(failed.ok, true)
})

test('every guard fails closed', () => {
  const base = { request, turn: turn('Analyze the Senate coalition and EU foreign policy'), alreadyVerified: false, now }
  const cases: Array<[any, string]> = [
    [{ ...base, request: { ...request, turnId: 'not-a-uuid' } }, 'turn_id_invalid'],
    [{ ...base, request: { ...request, outcome: 'great' } }, 'outcome_invalid'],
    [{ ...base, request: { ...request, evidenceRef: 'short' } }, 'evidence_reference_required'],
    [{ ...base, request: { ...request, evidenceRef: 'model: the answer said so' } }, 'evidence_reference_cannot_be_model_output'],
    [{ ...base, request: { ...request, summary: 'worked' } }, 'outcome_summary_required'],
    [{ ...base, turn: null }, 'turn_not_owned_or_not_found'],
    [{ ...base, alreadyVerified: true }, 'turn_outcome_already_verified'],
    [{ ...base, turn: turn('Analyze the Senate coalition and EU foreign policy', '2026-08-01T00:00:00Z') }, 'turn_too_old_to_verify'],
    [{ ...base, turn: turn('Analyze the Senate coalition and EU foreign policy', '2026-09-17T00:00:00Z') }, 'turn_time_invalid'],
    [{ ...base, turn: turn('hello there') }, 'request_matches_no_university_subject'],
  ]
  for (const [input, error] of cases) {
    const decision = decideOwnerVerifiedOutcome(input)
    assert.equal(decision.ok, false, error)
    assert.equal(!decision.ok && decision.error, error)
  }
})

test('ledger subjects are read only for the exact turn and only valid subject ids survive', () => {
  const rows = [
    { evidence: { profile: COS_OWNER_VERIFIED_SUBJECTS_PROFILE, turnId: 'other', subjects: ['mathematics'] } },
    { evidence: { profile: COS_OWNER_VERIFIED_SUBJECTS_PROFILE, turnId, subjects: ['politics_government_international_relations', 'not_a_subject'] } },
  ]
  assert.deepEqual(verifiedTurnSubjectsFromLedger(rows, turnId), ['politics_government_international_relations'])
  assert.equal(verifiedTurnSubjectsFromLedger(rows, '22222222-2222-4333-8444-555555555555'), null)
})

test('runtime records subjects first, writes through the single governed writer, and confirms by read-back', () => {
  const runtime = file('lib/ai/cos/cosOwnerVerifiedOutcomes.ts')
  assert.match(runtime, /\.eq\('user_id', userId\)/)
  assert.match(runtime, /event_key: hash\(\[COS_OWNER_VERIFIED_SUBJECTS_PROFILE, decision\.turnId\]\)/)
  assert.match(runtime, /sourceClass: 'authoritative_record'/)
  assert.match(runtime, /correlation: \{ kind: 'cos_turn_id', value: decision\.turnId \}/)
  assert.match(runtime, /verified_outcome_not_persisted/)
  assert.doesNotMatch(runtime, /verifiedProductionTurnOutcomeSource/)
  assert.ok(runtime.indexOf("from('cos_university_learning_assurance_events').insert") < runtime.indexOf('await recordVerifiedCosProductionOutcome('))
})

test('the Production bridge uses recorded subjects only for authoritative records and keeps problem_class otherwise', () => {
  const runner = file('lib/ai/cos/cosUniversityARangeRunner.ts')
  assert.match(runner, /if \(source\.startsWith\('production_verified:authoritative_record:'\)\)/)
  assert.match(runner, /const subjects = verifiedSubjects \?\? classifyCosUniversitySubjects\(experience\.data\?\.problem_class \|\| ''\)/)
})

test('route is owner-only for read and write', () => {
  const route = file('app/api/admin/cos-verified-outcomes/route.ts')
  assert.equal((route.match(/await requireOwner\(\)/g) || []).length, 2)
})

test('a geography or ethics question is not Economics just because it says "capital"', () => {
  assert.deepEqual(subjectsForVerifiedRequest('what is the capital of brazil?'), [])
  assert.equal(subjectsForVerifiedRequest('Is capital punishment morally justified?').includes('economics_finance'), false)
  assert.deepEqual(subjectsForVerifiedRequest('How should we think about capital allocation across our three product lines?'), ['economics_finance'])
  assert.equal(subjectsForVerifiedRequest('Estimate our cost of capital for the expansion').includes('economics_finance'), true)
  assert.equal(subjectsForVerifiedRequest('Compare venture capital and working capital options').includes('economics_finance'), true)
})
