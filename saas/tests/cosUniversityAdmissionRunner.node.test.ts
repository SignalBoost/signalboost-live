import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('admission runner is gated behind its own env flag, distinct from the graduation gate flag', () => {
  const runner = file('lib/ai/cos/cosUniversityAdmissionRunner.ts')
  assert.match(runner, /COS_UNIVERSITY_ADMISSION_ENABLED/)
})

test('admission runner reads enrollments, credentials, and assessments before deciding', () => {
  const runner = file('lib/ai/cos/cosUniversityAdmissionRunner.ts')
  assert.match(runner, /cos_university_program_enrollments/)
  assert.match(runner, /cos_university_credentials/)
  assert.match(runner, /cos_university_assessments/)
  assert.match(runner, /decideCosUniversityAdmission/)
})

test('admission runner accepts any explicit AI agent identity instead of enrolling only COS', () => {
  const runner = file('lib/ai/cos/cosUniversityAdmissionRunner.ts')
  assert.match(runner, /options: \{ now\?: Date; agentId\?: string; role\?: CosUniversityAgentRole \}/)
  assert.match(runner, /\.eq\('agent_id', agentId\)/)
  assert.match(runner, /agent_id: agentId/)
  assert.doesNotMatch(runner, /const AGENT_ID = 'cos'/)
})

test('undergraduate enrollment assigns the complete canonical subject curriculum', () => {
  const runner = file('lib/ai/cos/cosUniversityAdmissionRunner.ts')
  assert.match(runner, /assignCosUniversityCurriculum/)
  assert.match(runner, /COS_UNIVERSITY_SUBJECTS\.map\(subject => subject\.id\)/)
  assert.match(runner, /assignedSubjectIds: assignment\?\.requiredSubjectIds \|\| \[\]/)
})

test('admission runner binds a supplied AI role to the matching advanced curriculum', () => {
  const runner = file('lib/ai/cos/cosUniversityAdmissionRunner.ts')
  assert.match(runner, /assignCosUniversityRoleCurriculum/)
  assert.match(runner, /assignedMastersTrackId: roleAssignment\?\.advancedProgramId/)
})

test('admission runner only ever inserts a new enrollment row, never updates or deletes one', () => {
  const runner = file('lib/ai/cos/cosUniversityAdmissionRunner.ts')
  assert.match(runner, /\.insert\(\{/)
  assert.doesNotMatch(runner, /cos_university_program_enrollments'\)[\s\S]{0,80}\.update\(/)
  assert.doesNotMatch(runner, /cos_university_program_enrollments'\)[\s\S]{0,80}\.delete\(/)
})

test('admission runner treats a concurrent duplicate enrollment as success, not an error', () => {
  const runner = file('lib/ai/cos/cosUniversityAdmissionRunner.ts')
  assert.match(runner, /23505/)
})

test('the University graduation cron runs admission in the same tick right after graduation', () => {
  const route = file('app/api/cron/cos-university-graduation/route.ts')
  assert.match(route, /runCosUniversityGeneralistGraduationGate/)
  assert.match(route, /runCosUniversityAdmission/)
  const graduationAt = route.indexOf('runCosUniversityGeneralistGraduationGate({ now, agentId: agent.agentId })')
  const admissionAt = route.indexOf('runCosUniversityAdmission({ now, agentId: agent.agentId, role: agent.role })')
  assert.ok(graduationAt >= 0 && admissionAt >= 0 && graduationAt < admissionAt)
})

test('the shared program runtime gate now resolves across every level, not one hard-coded cohort', () => {
  const gate = file('lib/ai/cos/cosUniversityProgramRuntimeGate.ts')
  assert.match(gate, /evaluateCosUniversityActiveAcademicLane/)
  assert.match(gate, /export async function readCosUniversityUndergraduateAcademicLaneGate/)
})
