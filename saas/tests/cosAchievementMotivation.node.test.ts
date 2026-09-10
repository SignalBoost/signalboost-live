import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COS_ACHIEVEMENT_MOTIVATION_CONTRACT,
  buildCosAchievementStanding,
  rankCosAchievementStandings,
  type CosAppliedOutcomeEvidence,
} from '../lib/ai/cos/cosAchievementMotivation.ts'
import { COS_BEHAVIORAL_CONTRACT } from '../lib/ai/cos/cosBehavioralContract.ts'

let outcomeSequence = 0
const evidence = (agentId: string, overrides: Partial<CosAppliedOutcomeEvidence> = {}): CosAppliedOutcomeEvidence => ({
  outcomeId: `${agentId}-${++outcomeSequence}`,
  agentId,
  evaluationClass: 'shared-foundation',
  independentlyVerified: true,
  knowledgeApplied: true,
  succeeded: true,
  challengeLevel: 3,
  ...overrides,
})

test('knowledge and self-reported activity earn no standing without verified application', () => {
  const standing = buildCosAchievementStanding('software-specialist', 'shared-foundation', [
    evidence('software-specialist', { independentlyVerified: false }),
    evidence('software-specialist', { knowledgeApplied: false }),
  ])
  assert.equal(standing.verifiedApplications, 0)
  assert.equal(standing.appliedSuccessRate, null)
  assert.equal(standing.ranked, false)
})

test('healthy competition rewards difficult applied success, teamwork, and recovery', () => {
  const records = [
    evidence('software-specialist', { challengeLevel: 5, teamContribution: true }),
    evidence('software-specialist', { challengeLevel: 4, recoveredFailure: true }),
    evidence('software-specialist', { challengeLevel: 4 }),
    evidence('research-specialist'),
    evidence('research-specialist'),
    evidence('research-specialist'),
  ]
  const software = buildCosAchievementStanding('software-specialist', 'shared-foundation', records)
  const research = buildCosAchievementStanding('research-specialist', 'shared-foundation', records)
  assert.equal(rankCosAchievementStandings([research, software])[0]?.agentId, 'software-specialist')
  assert.equal(software.teamContributions, 1)
  assert.equal(software.recoveredFailures, 1)
})

test('dishonesty, unsafe behavior, metric gaming, or obstruction disqualifies competition standing', () => {
  const records = [
    evidence('coder', { violations: ['metric_manipulation'] }),
    evidence('coder'),
    evidence('coder'),
  ]
  const standing = buildCosAchievementStanding('coder', 'shared-foundation', records)
  assert.equal(standing.disqualified, true)
  assert.equal(standing.ranked, false)
})

test('specialists compete only inside a comparable evaluation class', () => {
  const a = buildCosAchievementStanding('a', 'software', [evidence('a', { evaluationClass: 'software' })])
  const b = buildCosAchievementStanding('b', 'research', [evidence('b', { evaluationClass: 'research' })])
  assert.throws(() => rankCosAchievementStandings([a, b]), /mixed_evaluation_classes_not_comparable/)
})

test('motivation contract preserves truth, team priority, and authority boundaries', () => {
  assert.match(COS_ACHIEVEMENT_MOTIVATION_CONTRACT, /not a claim that an AI has feelings/i)
  assert.match(COS_ACHIEVEMENT_MOTIVATION_CONTRACT, /team objective.*outrank individual standing/i)
  assert.match(COS_ACHIEVEMENT_MOTIVATION_CONTRACT, /never expand authority/i)
  assert.match(COS_BEHAVIORAL_CONTRACT, /COS ACHIEVEMENT MOTIVATION/)
})
