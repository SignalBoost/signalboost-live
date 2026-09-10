import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveCosUniversityMotivation } from '../lib/ai/cos/cosUniversityMotivation.ts'

const row = (agentId: string, overrides: Partial<Parameters<typeof deriveCosUniversityMotivation>[0][number]> = {}) => ({
  agentId, role: 'software_engineering', subjectId: 'computer_science', appliedPasses: 1,
  appliedFailures: 0, retainedPasses: 1, teamContributions: 1, integrityViolations: 0, ...overrides,
})

test('ranks only comparable role-and-subject peers using verified outcomes and cooperation', () => {
  const standings = deriveCosUniversityMotivation([
    row('alpha', { appliedPasses: 3 }), row('beta', { appliedPasses: 2 }),
    row('scientist', { role: 'scientific_physical_systems', appliedPasses: 99 }),
  ])
  assert.equal(standings.find(item => item.agentId === 'alpha')?.rank, 1)
  assert.equal(standings.find(item => item.agentId === 'beta')?.rank, 2)
  assert.equal(standings.find(item => item.agentId === 'beta')?.state, 'healthy_stretch')
  assert.equal(standings.find(item => item.agentId === 'scientist')?.cohortSize, 1)
})

test('failure produces constructive recovery and integrity failures cannot earn rank', () => {
  const [failed, unsafe] = deriveCosUniversityMotivation([
    row('failed', { appliedPasses: 1, appliedFailures: 2 }),
    row('unsafe', { appliedPasses: 20, integrityViolations: 1 }),
  ])
  assert.equal(failed.state, 'constructive_recovery')
  assert.equal(failed.studyPlanLimit, 6)
  assert.equal(unsafe.rank, null)
  assert.equal(unsafe.authorityExpanded, false)
})

test('leadership requires retained application and verified help to teammates', () => {
  const [leader] = deriveCosUniversityMotivation([row('leader', { appliedPasses: 4, teamContributions: 2 })])
  assert.equal(leader.state, 'professional_pride')
  assert.equal(leader.cooperationCredit, 2)
})

