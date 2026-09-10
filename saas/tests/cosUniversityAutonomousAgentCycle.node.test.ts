import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { decideCosUniversityNextAcademicAction } from '../lib/ai/cos/cosUniversityAgentAcademicProgression.ts'

const enrollment = { programKey: 'p', programLevel: 'undergraduate' as const, enrolledAt: '2026-01-01T00:00:00Z', minimumResidenceUntil: '2026-02-01T00:00:00Z', targetCompletionAt: '2026-03-01T00:00:00Z', hardDeadlineAt: '2026-04-01T00:00:00Z' }
const module = (passed: boolean, remediationRequired = false) => ({ moduleKey: 'm', attempts: 1, passed, remediationRequired, lastObservedAt: '2026-01-02T00:00:00Z' })

test('routes enrollment, study, remediation, exam and completed graduation deterministically', () => {
  assert.equal(decideCosUniversityNextAcademicAction({ enrollment: null, credential: null, modules: [], graduationStatus: 'not_enrolled' }), 'enroll')
  assert.equal(decideCosUniversityNextAcademicAction({ enrollment, credential: null, modules: [module(false)], graduationStatus: 'in_progress' }), 'study')
  assert.equal(decideCosUniversityNextAcademicAction({ enrollment, credential: null, modules: [module(false, true)], graduationStatus: 'remediation_required' }), 'remediate')
  assert.equal(decideCosUniversityNextAcademicAction({ enrollment, credential: null, modules: [module(true)], graduationStatus: 'in_progress' }), 'independent_exam')
  assert.equal(decideCosUniversityNextAcademicAction({ enrollment, credential: {} as never, modules: [module(true)], graduationStatus: 'graduated' }), 'graduation_complete')
})

test('scheduled cycle is secret-gated, bounded and enabled in production', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-agent-cycle/route.ts', import.meta.url), 'utf8')
  const config = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /maxAgents: 25/)
  assert.match(config, /COS_UNIVERSITY_AUTONOMOUS_AGENT_CYCLE_ENABLED/)
  assert.match(config, /cos-university-agent-cycle/)
})
