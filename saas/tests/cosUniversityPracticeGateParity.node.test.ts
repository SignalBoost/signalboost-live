// saas/tests/cosUniversityPracticeGateParity.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const gate = fs.readFileSync(path.join(process.cwd(), 'lib/ai/cos/cosUniversityPracticeStudyGate.ts'), 'utf8')
const cycle = fs.readFileSync(path.join(process.cwd(), 'lib/ai/cos/cosUniversityAutonomousAgentCycle.ts'), 'utf8')
const cosLane = fs.readFileSync(path.join(process.cwd(), 'app/api/cron/cos-university-practice/route.ts'), 'utf8')

test('the study gate reads the learner being gated, not COS for everyone', () => {
  assert.ok(!/\.eq\('agent_id', 'cos'\)/.test(gate), 'the gate is still pinned to COS')
  assert.match(gate, /agentId: string = 'cos'/)
  assert.match(gate, /\.eq\('agent_id', learner\)/)
})

test('COS stays the default so its dedicated lane is unchanged', () => {
  assert.match(cosLane, /readCosUniversityPracticeStudyGate\(\)/)
  assert.match(gate, /const learner = String\(agentId \|\| ''\)\.trim\(\) \|\| 'cos'/)
})

test('every agent clears the same accepted-study proof before practising', () => {
  // Previously the cycle called the practice runner directly, so a specialist could practise with no
  // host-written proof of accepted study for the current attempt — the exact check COS must pass.
  assert.match(cycle, /readCosUniversityPracticeStudyGate\(now, agent\.agentId\)/)
  const gateAt = cycle.indexOf('readCosUniversityPracticeStudyGate(now, agent.agentId)')
  // The practice entry point has been renamed once already (runConfigured...); match either, so this
  // test keeps checking the ORDER rather than one spelling.
  const runAt = cycle.search(/run(?:Configured)?CosUniversityDeliberatePractice\(\{/)
  assert.ok(gateAt > 0 && gateAt < runAt, 'the gate must precede execution')
})

test('practice is bound to the exact plan and round the gate approved', () => {
  assert.match(cycle, /requiredPlanId: studyGate\.planId,/)
  assert.match(cycle, /requiredPracticeRound: studyGate\.studyAttempt,/)
})

test('a learner without current proof does not practise, and that is not an error', () => {
  assert.match(cycle, /if \(studyGate\.allowed && studyGate\.planId && studyGate\.studyAttempt\) \{/)
  // No throw on a closed gate: the agent simply moves on this tick.
  const branch = cycle.slice(cycle.indexOf('if (studyGate.allowed'), cycle.indexOf('agents.push('))
  assert.ok(!/throw new Error\('practice/.test(branch), branch)
})

test('failed practice still reopens study for that same learner', () => {
  assert.match(cycle, /reopenCosUniversityStudyAfterFailedPractice\(practice\.runs, now, agent\.agentId\)/)
})
