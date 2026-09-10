import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = (path: string) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

test('continuous study is scoped to the enrolled agent from planning through accepted proof', () => {
  const learning = read('../lib/ai/cos/cosUniversityContinuousLearning.ts')
  assert.match(learning, /agentId\?: string/)
  assert.match(learning, /\^\[A-Za-z0-9\._-\]\{1,180\}\$/)
  assert.match(learning, /runCosUniversityPlanningCycle\(\{ now, agentId, maxPlans: 12 \}\)/)
  assert.match(learning, /ensureCosUniversityExamFailureRemediationPlans\(\{ agentId, maxPlans: 4, now \}\)/)
  assert.match(learning, /\.eq\('agent_id', agentId\)/)
  assert.match(learning, /recordAcceptedCosUniversityStudyAttempts\(proofs, new Date\(\), agentId\)/)
})

test('study plans and remediation cannot collide or transfer across agent identities', () => {
  const store = read('../lib/ai/cos/cosUniversityStore.ts')
  const remediation = read('../lib/ai/cos/cosUniversityExamRemediation.ts')
  const proof = read('../lib/ai/cos/cosUniversityStudyProof.ts')
  assert.match(store, /planKey\(\['agent', scopedAgentId, candidate\.planKey\]\)/)
  assert.match(store, /readCosUniversityAcademicState\(now, agentId\)/)
  assert.match(remediation, /\.like\('run_key', `%:\$\{agentId\}:%`\)/)
  assert.match(remediation, /agent_id: agentId/)
  assert.match(proof, /\.eq\('agent_id', clean\(agentId, 180\)\)/)
})

test('autonomous registered-agent cycle executes study and remediation work directly', () => {
  const cycle = read('../lib/ai/cos/cosUniversityAutonomousAgentCycle.ts')
  assert.match(cycle, /nextAction === 'study' \|\| nextAction === 'remediate'/)
  assert.match(cycle, /runCosUniversityContinuousLearning\(\{ now, agentId: agent\.agentId, maxStudyPlans: 4 \}\)/)
})

test('deliberate practice preserves agent identity through proof, queue, and execution', () => {
  const runner = read('../lib/ai/cos/cosUniversityDeliberatePracticeRunner.ts')
  const cycle = read('../lib/ai/cos/cosUniversityAutonomousAgentCycle.ts')
  const examRunner = read('../lib/ai/cos/cosUniversityIndependentExamRunner.ts')
  assert.match(runner, /agentId\?: string/)
  assert.match(runner, /\.eq\('agent_id', agentId\)/)
  assert.match(runner, /\{ origin: ORIGIN, agentId, universityPlanId:/)
  assert.match(runner, /practiceFenceStillValid\(agentId, planId, practiceRound\)/)
  assert.match(cycle, /runCosUniversityDeliberatePractice\(\{ agentId: agent\.agentId, maxPlans: 1, maxExercises: 2 \}\)/)
  assert.doesNotMatch(cycle, /if \(learning\.plansAttempted > 0\)/)
  assert.match(cycle, /readyStudyPlansOnly: true/)
  assert.match(examRunner, /\.eq\('agent_id', agentId\)[\s\S]*\.eq\('status', 'ready_for_exam'\)/)
  assert.match(examRunner, /reconcileReadyStudyPlan/)
  assert.match(examRunner, /status: passed \? 'completed' : 'superseded'/)
})
