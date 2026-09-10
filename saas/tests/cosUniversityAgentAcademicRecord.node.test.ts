import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCosUniversityAgentAcademicRecord } from '../lib/ai/cos/cosUniversityAgentAcademicRecord.ts'

const enrollment = {
  programKey: 'masters_applied_ai_systems_v1', programLevel: 'masters' as const,
  enrolledAt: '2026-01-01T00:00:00.000Z', minimumResidenceUntil: '2026-02-01T00:00:00.000Z',
  targetCompletionAt: '2026-03-01T00:00:00.000Z', hardDeadlineAt: '2026-04-01T00:00:00.000Z',
}

test('tracks pass, failure and remediation independently for one durable agent', () => {
  const record = buildCosUniversityAgentAcademicRecord({
    agentId: 'software-specialist', role: 'software_engineering', requiredModuleKeys: ['code', 'systems'],
    enrollments: [enrollment], credentials: [], attempts: [
      { moduleKey: 'code', passed: false, observedAt: '2026-01-02T00:00:00.000Z' },
      { moduleKey: 'code', passed: true, observedAt: '2026-01-03T00:00:00.000Z' },
      { moduleKey: 'systems', passed: false, observedAt: '2026-01-04T00:00:00.000Z' },
    ],
  })
  assert.equal(record.modulesPassed, 1)
  assert.equal(record.completionRatio, 0.5)
  assert.equal(record.modules[0].remediationRequired, false)
  assert.equal(record.modules[1].remediationRequired, true)
  assert.equal(record.graduationStatus, 'remediation_required')
})

test('only an issued credential marks the agent graduated', () => {
  const record = buildCosUniversityAgentAcademicRecord({
    agentId: 'software-specialist', role: 'software_engineering', requiredModuleKeys: ['code'],
    enrollments: [enrollment], attempts: [{ moduleKey: 'code', passed: true, observedAt: '2026-01-03T00:00:00.000Z' }],
    credentials: [{ credentialKey: 'degree', programKey: enrollment.programKey, programLevel: 'masters', title: 'Degree', standing: 'A', awardedAt: '2026-03-01T00:00:00.000Z' }],
  })
  assert.equal(record.graduationStatus, 'graduated')
})

test('rejects an academic record without a durable agent identity', () => {
  assert.throws(() => buildCosUniversityAgentAcademicRecord({
    agentId: ' ', role: 'cybersecurity', requiredModuleKeys: [], enrollments: [], credentials: [], attempts: [],
  }), /durable AI agent identity/)
})
