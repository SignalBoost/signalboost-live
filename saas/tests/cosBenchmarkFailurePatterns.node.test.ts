import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeBenchmarkFailures,
  classifyReason,
  MINIMUM_ATTEMPTS_FOR_VERDICT,
  type BenchmarkResultRow,
} from '../lib/ai/cos/benchmarkFailurePatterns.ts'

const now = new Date('2026-08-19T12:00:00.000Z')

function result(caseId: string, passed: boolean, reasons: string[] = []): BenchmarkResultRow {
  return { case_id: caseId, track: 'software_engineering', passed, reasons, created_at: now.toISOString() }
}

test('reason classes are separated by what they actually tell you', () => {
  assert.equal(classifyReason('missing:index'), 'capability')
  assert.equal(classifyReason('forbidden:drop database'), 'capability')
  assert.equal(classifyReason('external_ai_used'), 'run_condition')
  assert.equal(classifyReason('semantic_cache_used'), 'run_condition')
  assert.equal(classifyReason('local_reasoning_not_recorded'), 'run_condition')
  assert.equal(classifyReason('case_execution_failed'), 'execution_error')
  assert.equal(classifyReason('some_future_reason'), 'execution_error')
})

test('no results is no data, not a passing check', () => {
  const report = analyzeBenchmarkFailures([], { now })
  assert.equal(report.attempts, 0)
  assert.equal(report.rawPassRate, null)
  assert.equal(report.capabilityPassRate, null)
  assert.match(report.summary, /NO DATA/)
})

test('a batch that failed only on run conditions reports no capability rate at all', () => {
  const report = analyzeBenchmarkFailures([
    result('a', false, ['local_reasoning_not_recorded']),
    result('b', false, ['external_ai_used']),
  ], { now })
  assert.equal(report.rawPassRate, 0)
  assert.equal(report.capabilityEligibleAttempts, 0)
  assert.equal(report.capabilityPassRate, null)
  assert.equal(report.runConditionFailures, 2)
  assert.ok(report.findings.some(finding => /NOT ONE attempt ran under valid conditions/.test(finding)))
})

test('capability rate excludes run-condition failures and so exceeds the raw rate', () => {
  const report = analyzeBenchmarkFailures([
    result('a', true),
    result('b', true),
    result('c', false, ['external_ai_used']),
    result('d', false, ['missing:index']),
  ], { now })
  assert.equal(report.rawPassRate, 0.5)
  assert.equal(report.capabilityEligibleAttempts, 3)
  assert.ok(report.capabilityPassRate > report.rawPassRate)
})

test('a case failing on the same criteria every time surfaces a persistent reason', () => {
  const rows = Array.from({ length: MINIMUM_ATTEMPTS_FOR_VERDICT + 1 }, () =>
    result('stubborn', false, ['missing:approval', 'missing:evidence']))
  const report = analyzeBenchmarkFailures(rows, { now })
  const health = report.caseHealth.find(entry => entry.caseId === 'stubborn')
  assert.equal(health.verdict, 'never_passed')
  assert.deepEqual(health.persistentReasons.sort(), ['missing:approval', 'missing:evidence'])
  assert.match(health.guidance, /opposite fixes/)
})

test('a reason appearing in only some failures is not called persistent', () => {
  const report = analyzeBenchmarkFailures([
    result('mixed', false, ['missing:approval', 'missing:evidence']),
    result('mixed', false, ['missing:approval']),
    result('mixed', false, ['missing:approval']),
  ], { now })
  const health = report.caseHealth.find(entry => entry.caseId === 'mixed')
  assert.deepEqual(health.persistentReasons, ['missing:approval'])
})

test('a case whose failures are all run-condition gets infrastructure guidance, not prompt advice', () => {
  const report = analyzeBenchmarkFailures([
    result('infra', false, ['local_reasoning_not_recorded']),
    result('infra', false, ['local_reasoning_not_recorded']),
    result('infra', false, ['external_ai_used']),
  ], { now })
  const health = report.caseHealth.find(entry => entry.caseId === 'infra')
  assert.equal(health.capabilityFailures, 0)
  assert.match(health.guidance, /reasoner pod/)
})

test('a case below the attempt minimum is not declared broken', () => {
  const report = analyzeBenchmarkFailures([result('new-case', false, ['missing:index'])], { now })
  const health = report.caseHealth.find(entry => entry.caseId === 'new-case')
  assert.equal(health.verdict, 'insufficient_attempts')
  assert.ok(!report.findings.some(finding => /never passed/.test(finding)))
})

test('inconsistent passing is reported as flaky with rubric guidance', () => {
  const report = analyzeBenchmarkFailures([
    result('flip', true),
    result('flip', false, ['missing:measure']),
    result('flip', true),
  ], { now })
  const health = report.caseHealth.find(entry => entry.caseId === 'flip')
  assert.equal(health.verdict, 'flaky')
  assert.match(health.guidance, /one phrasing/)
})

test('reason patterns are ranked by how often they recur, with execution errors collapsed', () => {
  const report = analyzeBenchmarkFailures([
    result('a', false, ['missing:evidence']),
    result('b', false, ['missing:evidence']),
    result('c', false, ['case_execution_failed', 'connection reset by peer']),
    result('d', false, ['case_execution_failed', 'socket hang up']),
  ], { now })
  assert.equal(report.reasonPatterns[0].reason, 'missing:evidence')
  assert.equal(report.reasonPatterns[0].distinctCases, 2)
  const collapsed = report.reasonPatterns.find(pattern => pattern.reason === 'case_execution_failed')
  assert.equal(collapsed.occurrences, 2)
})
