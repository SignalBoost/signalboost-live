// saas/tests/cosUniversityAgentGradeEligibility.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { SOFTWARE_CAPSTONE_RUNTIME } from '../lib/ai/cos/cosUniversityAgentCapstone.ts'
import {
  assessmentCarriesBoundExecution,
  assessmentGradeEligibleForAgent,
} from '../lib/ai/cos/cosUniversityAgentGradeEligibility.ts'

const file = (relative: string) => fs.readFileSync(path.resolve(import.meta.dirname, '..', relative), 'utf8')

const bound = (agentId: string) => ({
  runtime: SOFTWARE_CAPSTONE_RUNTIME,
  role: 'software_engineering',
  agentId,
  turnId: '0f9f2a7c-2b47-4a0e-9d1a-6c4a1f2e8b30',
  model: 'configured-builder',
  academicAuthority: 'none',
})

test('COS rows remain grade-eligible: its evidence always was its own work', () => {
  assert.equal(assessmentGradeEligibleForAgent({ agent_id: 'cos', scorer_authority: 'host_private_exam', evidence: {} }, 'cos'), true)
  assert.equal(assessmentGradeEligibleForAgent({ agent_id: 'cos', scorer_authority: 'host_capstone' }, 'cos'), true)
})

test('a specialist row written before its bound executor no longer counts toward its grades', () => {
  const legacy = { agent_id: 'software-specialist', scorer_authority: 'host_private_exam', evidence: { turnId: 'abc', executionProvenance: null } }
  assert.equal(assessmentGradeEligibleForAgent(legacy, 'software-specialist'), false)
  assert.equal(assessmentGradeEligibleForAgent({ ...legacy, evidence: {} }, 'software-specialist'), false)
  assert.equal(assessmentGradeEligibleForAgent({ ...legacy, evidence: undefined }, 'software-specialist'), false)
})

test('a specialist row carrying its own bound execution does count', () => {
  const row = { agent_id: 'software-specialist', scorer_authority: 'host_private_exam', evidence: { executionProvenance: bound('software-specialist') } }
  assert.equal(assessmentGradeEligibleForAgent(row, 'software-specialist'), true)
})

test('another agent\'s execution, COS identity, or a missing field cannot satisfy the binding', () => {
  const id = 'software-specialist'
  assert.equal(assessmentCarriesBoundExecution({ executionProvenance: bound('other-agent') }, id), false)
  assert.equal(assessmentCarriesBoundExecution({ executionProvenance: bound('cos') }, 'cos'), false)
  for (const field of ['runtime', 'role', 'agentId', 'turnId', 'model', 'academicAuthority'] as const) {
    const execution: Record<string, unknown> = { ...bound(id) }
    delete execution[field]
    assert.equal(assessmentCarriesBoundExecution({ executionProvenance: execution }, id), false, `${field} is required`)
  }
  assert.equal(assessmentCarriesBoundExecution({ executionProvenance: { ...bound(id), model: '  ' } }, id), false)
  assert.equal(assessmentCarriesBoundExecution({ executionProvenance: { ...bound(id), academicAuthority: 'granted' } }, id), false)
})

test('an agent\'s own verified Production work needs no executor, and cross-agent rows never count', () => {
  assert.equal(assessmentGradeEligibleForAgent({ agent_id: 'software-specialist', scorer_authority: 'verified_production' }, 'software-specialist'), true)
  assert.equal(assessmentGradeEligibleForAgent({ agent_id: 'cos', scorer_authority: 'host_private_exam' }, 'software-specialist'), false)
  assert.equal(assessmentGradeEligibleForAgent({ agent_id: '  ', scorer_authority: 'host_private_exam' }, 'software-specialist'), false)
})

test('the shared academic reader applies the rule per agent and selects the columns it needs', () => {
  const store = file('lib/ai/cos/cosUniversityStore.ts')
  assert.match(store, /if \(!assessmentGradeEligibleForAgent\(row, agentId\)\) return false/)
  assert.match(store, /if \(!gradeEligible\(row, nowMs, owner\)\) continue/)
  assert.match(store, /\.select\('assessment_key,agent_id,evidence,/, 'the reader must load agent and evidence')
  assert.match(store, /academicStateFromRows\(\(result\.data \|\| \[\]\) as AssessmentRow\[\], now, clean\(agentId, 180\) \|\| DEFAULT_AGENT_ID\)/)
})

test('every graded lane stamps the bound execution into the evidence it writes', () => {
  const lanes: Array<[string, RegExp]> = [
    ['lib/ai/cos/cosUniversityIndependentExamRunner.ts', /executionProvenance: execution,/],
    ['lib/ai/cos/cosUniversityARangeRunner.ts', /executionProvenance: args\.executionProvenance \|\| null/],
    ['lib/ai/cos/cosUniversityLanguageARangeRunner.ts', /executionProvenance: args\.executionProvenance \|\| null/],
    ['lib/ai/cos/cosUniversityRetentionRunner.ts', /retentionOnly: true, turnId, executionProvenance/],
  ]
  for (const [lane, pattern] of lanes) assert.match(file(lane), pattern, `${lane} must stamp its execution identity`)
})
