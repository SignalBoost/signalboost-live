// saas/tests/cosAnswerSpecificity.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { assessAnswerSpecificity, capForScore, specificityReason } from '../lib/ai/cos/answerSpecificity'

const GENERIC_ANSWER = [
  'The sudden increase in API p95 latency specifically affecting enterprise tenants while CPU and memory usage are normal suggests several potential architectural issues.',
  'Resource Contention within Multi-Tenant Database Clusters. Enterprise tenants might be experiencing higher contention for shared resources, leading to increased latency.',
  'Monitor wait statistics and query execution times for enterprise tenants versus smaller ones. Look for signs of lock contention or long-running queries.',
  'API Throttling or Rate Limiting. Enterprise tenants might be hitting higher API rate limits compared to smaller tenants, causing increased latency as requests are throttled.',
  'Check API request logs and response codes for enterprise tenants to see if there is a pattern of throttling.',
  'Network Latency Issues. Network latency could be higher for enterprise tenants due to their location or network configuration.',
  'Use network monitoring tools to measure round-trip times and packet loss.',
  'Configuration Differences. Enterprise tenants might have different configurations that lead to increased latency.',
  'Review configuration settings and query patterns for enterprise tenants versus smaller ones.',
].join(' ')

const SPECIFIC_ANSWER = [
  'Normal CPU with tripled p95 is a queueing signature, not a compute one.',
  'Confirm with pg_stat_statements: mean_exec_time rises while calls stays flat. It is ruled out if the plan hash is unchanged.',
  'Second: connection pool starvation. Confirm with pool queue depth and pg_stat_activity wait_event distribution.',
  'Absent any pool wait time, this is disconfirmed. All checks are read-only.',
].join(' ')

const ROBOTICS_ANSWER = [
  'Use tactile feedback to close the grasp loop rather than replaying a fixed trajectory.',
  'Track contact force, grip force, slip rate and the tactile pressure map; reduce commanded joint torque when slip events rise without increasing normal force beyond the object damage limit.',
  'Use end-effector pose and inverse kinematics residual to verify that the compliant correction remains reachable; a rising Jacobian condition number would indicate approach to a singular configuration.',
  'For uncertainty, monitor state covariance and innovation residual rather than treating a single pose estimate as truth. If covariance stays low while repeated tactile observations disagree, the estimator model is falsified.',
  'For endurance, inspect motor current, motor temperature and thermal headroom. Thermal throttling or actuator saturation should reduce speed before temperature limit is crossed.',
].join(' ')

test('the generic answer is scored as unspecific and capped below the gate', () => {
  const assessment = assessAnswerSpecificity(GENERIC_ANSWER)
  assert.equal(assessment.applies, true)
  assert.ok(assessment.score < 0.35, `expected a low specificity score, got ${assessment.score}`)
  assert.ok(assessment.cap < 0.72, `cap ${assessment.cap} must fall below the 0.72 escalation threshold`)
})

test('an SRE answer naming real observables is not capped below the gate', () => {
  const assessment = assessAnswerSpecificity(SPECIFIC_ANSWER)
  assert.ok(assessment.score > 0.6, `expected a high specificity score, got ${assessment.score}`)
  assert.equal(assessment.cap, 1)
  assert.ok(assessment.signals.identifiers.some(id => id.includes('pg_stat')))
  assert.ok(assessment.signals.falsifiers > 0)
})

test('robotics and control observables count as checkable artifacts', () => {
  const assessment = assessAnswerSpecificity(ROBOTICS_ANSWER)
  assert.equal(assessment.applies, true)
  assert.equal(assessment.cap, 1, `robotics observables should pass specificity, got score ${assessment.score}`)
  assert.ok(assessment.signals.domainArtifacts.includes('contact force'))
  assert.ok(assessment.signals.domainArtifacts.includes('joint torque'))
  assert.ok(assessment.signals.domainArtifacts.includes('state covariance'))
  assert.ok(assessment.signals.domainArtifacts.includes('motor temperature'))
})

test('short direct answers are exempt, so being concise is never penalised', () => {
  const assessment = assessAnswerSpecificity('Your next invoice is due on the 14th.')
  assert.equal(assessment.applies, false)
  assert.equal(assessment.cap, 1)
})

test('the cap can only lower confidence, never raise it', () => {
  assert.equal(capForScore(1), 1)
  assert.ok(capForScore(0.5) < 1)
  assert.ok(capForScore(0) < capForScore(0.5))
})

test('the recorded reason names what was missing rather than only a number', () => {
  const reason = specificityReason(assessAnswerSpecificity(GENERIC_ANSWER))
  assert.ok(/capped confidence at/.test(reason))
  assert.ok(/artifact/.test(reason))
})
