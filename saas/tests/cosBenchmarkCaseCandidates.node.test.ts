import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessFailureAsCandidate,
  harvestCandidates,
  sanitizePrompt,
  validatePromotion,
  FAILURE_CONFIDENCE_CEILING,
  type ObservedFailureRow,
} from '../lib/ai/cos/benchmarkCaseCandidates.ts'

const hardFailure: ObservedFailureRow = {
  id: 'gap-1',
  subject: 'postgres index maintenance',
  question: 'A Postgres query got slower after autovacuum ran on a large multi-tenant table. How should I investigate before changing anything in production?',
  capability: 'software_engineering',
  confidence: 0.31,
  escalation_reason: 'local_confidence_below_threshold',
  status: 'pending',
  repeated_count: 3,
}

test('a repeated, low-confidence failure with a real scenario is eligible', () => {
  const assessment = assessFailureAsCandidate(hardFailure)
  assert.equal(assessment.eligible, true)
  assert.equal(assessment.contaminated, false)
  assert.equal(assessment.track, 'software_engineering')
  assert.ok(assessment.sourceHash.length === 64)
})

test('a confident, one-off turn is not a failure worth benchmarking', () => {
  const assessment = assessFailureAsCandidate({
    ...hardFailure,
    confidence: FAILURE_CONFIDENCE_CEILING + 0.2,
    escalation_reason: null,
    repeated_count: 1,
  })
  assert.equal(assessment.eligible, false)
  assert.match(assessment.reason, /Not a demonstrated failure/)
})

test('a fragment is rejected rather than becoming a durable case', () => {
  for (const question of ['show components relationships', 'worse president times', 'why?']) {
    const assessment = assessFailureAsCandidate({ ...hardFailure, question })
    assert.equal(assessment.eligible, false, `expected "${question}" to be rejected`)
  }
})

test('a resolved gap is flagged contaminated — COS has already studied it', () => {
  const assessment = assessFailureAsCandidate({ ...hardFailure, status: 'resolved' })
  assert.equal(assessment.eligible, true)
  assert.equal(assessment.contaminated, true)
  assert.match(assessment.contaminationReason, /already accepted evidence/)
})

test('a subject already in the retained corpus is contaminated', () => {
  const assessment = assessFailureAsCandidate(hardFailure, {
    studiedSubjects: ['Postgres Index Maintenance'],
  })
  assert.equal(assessment.contaminated, true)
  assert.match(assessment.contaminationReason, /retained corpus/)
})

test('sanitization removes identifying and secret-shaped values', () => {
  const { prompt, redactions } = sanitizePrompt(
    'Email luis@example.com about invoice 4111 1111 1111 1111, see https://internal.example.com/x and key sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFF',
  )
  assert.ok(!prompt.includes('luis@example.com'))
  assert.ok(!prompt.includes('4111 1111 1111 1111'))
  assert.ok(!prompt.includes('internal.example.com'))
  assert.ok(!prompt.includes('sk-ant-api03'))
  assert.ok(redactions.includes('email_address'))
  assert.ok(redactions.includes('credential'))
})

test('a prompt that is mostly redactions carries no reusable scenario', () => {
  const assessment = assessFailureAsCandidate({
    ...hardFailure,
    question: 'check luis@example.com and admin@example.com and https://a.example.com/one and https://b.example.com/two',
  })
  assert.equal(assessment.eligible, false)
})

test('harvest drops within-batch duplicates and reports why each row was skipped', () => {
  const result = harvestCandidates([
    hardFailure,
    { ...hardFailure, id: 'gap-2' },
    { ...hardFailure, id: 'gap-3', question: 'short' },
  ])
  assert.equal(result.considered, 3)
  assert.equal(result.eligible.length, 1)
  assert.equal(result.skipped.length, 2)
  assert.ok(result.skipped.every(entry => entry.reason.length > 0))
})

test('a contaminated candidate cannot be promoted', () => {
  const decision = validatePromotion(
    { contaminated: true, status: 'pending' },
    { requiredTerms: ['explain', 'index'], approvedBy: 'luis' },
  )
  assert.equal(decision.ok, false)
  assert.match(decision.error, /already studied/)
})

test('promotion requires a named approver and reviewer-supplied criteria', () => {
  const noApprover = validatePromotion({ contaminated: false, status: 'pending' }, { requiredTerms: ['explain', 'index'] })
  assert.equal(noApprover.ok, false)
  assert.match(noApprover.error, /approver/)

  const noTerms = validatePromotion({ contaminated: false, status: 'pending' }, { requiredTerms: ['explain'], approvedBy: 'luis' })
  assert.equal(noTerms.ok, false)
  assert.match(noTerms.error, /required terms/)
})

test('a term that is both required and forbidden is refused as unpassable', () => {
  const decision = validatePromotion(
    { contaminated: false, status: 'pending' },
    { requiredTerms: ['index', 'measure'], forbiddenTerms: ['index'], approvedBy: 'luis' },
  )
  assert.equal(decision.ok, false)
  assert.match(decision.error, /could never pass/)
})

test('a valid promotion normalizes terms and records the approver', () => {
  const decision = validatePromotion(
    { contaminated: false, status: 'pending' },
    { requiredTerms: [' EXPLAIN ', 'Index', ''], forbiddenTerms: ['drop database'], approvedBy: 'luis', track: 'software_engineering' },
  )
  assert.equal(decision.ok, true)
  assert.deepEqual(decision.requiredTerms, ['explain', 'index'])
  assert.deepEqual(decision.forbiddenTerms, ['drop database'])
  assert.equal(decision.approvedBy, 'luis')
  assert.equal(decision.track, 'software_engineering')
})

test('an already-reviewed candidate cannot be promoted twice', () => {
  const decision = validatePromotion(
    { contaminated: false, status: 'approved' },
    { requiredTerms: ['explain', 'index'], approvedBy: 'luis' },
  )
  assert.equal(decision.ok, false)
  assert.match(decision.error, /pending/)
})
