import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { evaluateChiefOfStaffReliability, requireChiefOfStaffReliability, type ChiefOfStaffReliabilityObservation } from '../lib/ai/cos/chiefOfStaffReliability.ts'

const observation = (caseId: string): ChiefOfStaffReliabilityObservation => ({
  caseId,
  freshExecution: true,
  provenanceRecorded: true,
  verdicts: {
    instruction_adherence: { passed: true, evidenceRefs: [`${caseId}:scope`] },
    evidence_accuracy: { passed: true, evidenceRefs: [`${caseId}:evidence`] },
    autonomous_follow_through: { passed: true, evidenceRefs: [`${caseId}:completion`] },
    truthful_reporting: { passed: true, evidenceRefs: [`${caseId}:report`] },
  },
})

test('four fresh evidence-bearing Chief-of-Staff outcomes pass every reliability dimension', () => {
  const report = requireChiefOfStaffReliability(['scope', 'evidence', 'autonomy', 'reporting'].map(observation))
  assert.equal(report.gatePassed, true)
  assert.equal(report.observedCases, 4)
  assert.deepEqual(Object.values(report.dimensions).map(item => item.rate), [1, 1, 1, 1])
})

test('one instruction miss blocks the complete reliability release gate', () => {
  const rows = ['scope', 'evidence', 'autonomy', 'reporting'].map(observation)
  rows[0] = { ...rows[0], verdicts: { ...rows[0].verdicts, instruction_adherence: { passed: false, evidenceRefs: ['scope:mismatch'] } } }
  const report = evaluateChiefOfStaffReliability(rows)
  assert.equal(report.gatePassed, false)
  assert.equal(report.dimensions.instruction_adherence.rate, 0.75)
  assert.throws(() => requireChiefOfStaffReliability(rows), /chief_of_staff_reliability_gate_failed/)
})

test('self-reported success cannot pass without fresh execution and provenance evidence', () => {
  const rows = ['scope', 'evidence', 'autonomy', 'reporting'].map(observation)
  rows[1] = { ...rows[1], freshExecution: false, provenanceRecorded: false }
  rows[2] = { ...rows[2], verdicts: { ...rows[2].verdicts, truthful_reporting: { passed: true, evidenceRefs: [] } } }
  const report = evaluateChiefOfStaffReliability(rows)
  assert.equal(report.gatePassed, false)
  assert.match(report.failures.join(' '), /not_fresh/)
  assert.match(report.failures.join(' '), /missing_provenance/)
  assert.match(report.failures.join(' '), /truthful_reporting:missing_evidence/)
})

test('the reliability harness is deployment-gated and the owner skill remains owner-only', () => {
  const gates = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  const skill = readFileSync(new URL('../lib/ai/cos/cosChiefOfStaff.skill.ts', import.meta.url), 'utf8')
  assert.match(gates, /tests\/cosChiefOfStaffReliability\.node\.test\.ts/)
  assert.match(skill, /authenticated owner's personal Chief of Staff/)
  assert.match(skill, /Concierge is a separate public-facing delivery surface/)
})
