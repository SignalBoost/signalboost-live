// saas/tests/cosAnswerSpecificity.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { assessAnswerSpecificity, capForScore, specificityReason } from '../lib/ai/cos/answerSpecificity'

// The answer COS actually served, at a confidence above the 0.72 escalation threshold.
const GENERIC_ANSWER = [
  'The sudden increase in API p95 latency specifically affecting enterprise tenants while CPU and memory usage are normal suggests several potential architectural issues.',
  'Resource Contention within Multi-Tenant Database Clusters. Enterprise tenants might be experiencing higher contention for shared resources, leading to increased latency.',
  'Monitor wait statistics and query execution times for enterprise tenants versus smaller ones. Look for signs of lock contention or long-running queries.',
  'API Throttling or Rate Limiting. Enterprise tenants might be hitting higher API rate limits compared to smaller tenants, causing increased latency as requests are throttled.',
  'Check API request logs and response codes for enterprise tenants to see if there is a pattern of throttling. Compare this with the behavior observed for smaller tenants.',
  'Network Latency Issues. Network latency could be higher for enterprise tenants due to their location or network configuration.',
  'Use network monitoring tools to measure round-trip times and packet loss. Compare these metrics with those of smaller tenants.',
  'Configuration Differences. Enterprise tenants might have different configurations that lead to increased latency.',
  'Review configuration settings and query patterns for enterprise tenants versus smaller ones.',
  'Data Skew. Data skew can occur when certain tenants have significantly more data than others.',
  'Analyze database query logs to identify if there are specific queries that take longer for enterprise tenants.',
].join(' ')

const SPECIFIC_ANSWER = [
  'Normal CPU with tripled p95 is a queueing signature, not a compute one, so start where time is spent waiting rather than executing.',
  'Most likely: a plan flip on large tenants. autovacuum refreshed statistics and an index scan became a sequential scan above a row count only enterprise tenants cross.',
  'Confirm with pg_stat_statements: mean_exec_time for the tenant-scoped statement rises while calls stays flat. It is ruled out if the plan hash is unchanged across the window.',
  'Second: connection pool starvation. Enterprise requests hold pooled connections longer and smaller tenants queue behind them.',
  'Confirm with pool queue depth and pg_stat_activity wait_event distribution showing Client or LWLock waits. Absent any pool wait time, this is disconfirmed.',
  'Third: cache working set eviction, visible as hit rate falling for enterprise key prefixes only while overall hit rate looks stable.',
  'All three are readable without mutation: pg_stat_statements deltas, pg_stat_activity samples and the pool metrics already exported at 30 s resolution.',
].join(' ')

test('the generic answer COS actually served is scored as unspecific and capped below the gate', () => {
  const assessment = assessAnswerSpecificity(GENERIC_ANSWER)

  assert.equal(assessment.applies, true)
  assert.ok(assessment.score < 0.35, `expected a low specificity score, got ${assessment.score}`)
  assert.ok(assessment.cap < 0.72, `cap ${assessment.cap} must fall below the 0.72 escalation threshold`)
})

test('an answer naming real observables is not capped below the gate', () => {
  const assessment = assessAnswerSpecificity(SPECIFIC_ANSWER)

  assert.ok(assessment.score > 0.6, `expected a high specificity score, got ${assessment.score}`)
  assert.equal(assessment.cap, 1, 'a specific answer must be left to the evidence ceiling and the model number')
  assert.ok(assessment.signals.identifiers.some(id => id.includes('pg_stat')), 'the named views should register as artifacts')
  assert.ok(assessment.signals.falsifiers > 0, 'stated disconfirming conditions should register')
})

test('the specific answer outscores the generic one by a wide margin', () => {
  const generic = assessAnswerSpecificity(GENERIC_ANSWER)
  const specific = assessAnswerSpecificity(SPECIFIC_ANSWER)
  assert.ok(specific.score - generic.score > 0.4, `margin too narrow: ${generic.score} vs ${specific.score}`)
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
