// saas/tests/cosWorkforceVerificationTrace.node.test.ts
//
// The Workforce verification trace (owner 2026-10-06) explains why served graduate work never becomes a verified
// Production outcome. It is read only, counts only, and never leaks user ids.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  WORKFORCE_TRACE_SCHEMA_VERSION,
  composeWorkforceTrace,
  describeWorkforceTrace,
  errorClassFamily,
} from '../lib/ai/cos/cosWorkforceVerificationTrace.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const NOW = new Date('2026-10-06T12:00:00Z')
const T = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('served production turns are split by whether chat history holds them and whether a verified outcome exists', () => {
  const trace = composeWorkforceTrace({
    now: NOW,
    truncated: false,
    assignments: [
      { status: 'served', source_kind: 'production_request', source_ref: T(1), harness_run_id: 'run-1' },
      { status: 'served', source_kind: 'production_request', source_ref: T(2) },
      { status: 'served', source_kind: 'production_request', source_ref: T(3) },
      { status: 'served', source_kind: 'production_shadow', source_ref: 'shadow-1' },
      { status: 'runtime_failed', source_kind: 'production_request', source_ref: T(4), failure_reason: 'runtime_deadline_exceeded:idle:gate=warm' },
      { status: 'runtime_failed', source_kind: 'production_request', source_ref: T(5), failure_reason: 'runtime_deadline_exceeded:running' },
      { status: 'verified', source_kind: 'production_request', source_ref: T(6) },
    ],
    chatTurns: [{ user_id: 'u1', turn_id: T(1) }, { user_id: 'u1', turn_id: T(6) }],
    turnOutcomes: [
      { turn_id: T(1), outcome_source: 'turn_experience', verified_success: null },
      { turn_id: T(3), outcome_source: 'production_verified:authoritative_record:other:abc', verified_success: true },
    ],
    attempts: [
      { phase: 'attempt_failed', outcome: 'timeout', error_class: 'runtime_deadline_exceeded:idle:gate=warm:12s' },
      { phase: 'attempt_failed', outcome: 'empty', error_class: null },
      { phase: 'attempt_succeeded', outcome: 'success', error_class: null },
    ],
  })
  assert.equal(trace.schemaVersion, WORKFORCE_TRACE_SCHEMA_VERSION)
  assert.deepEqual(trace.assignments.byStatus, { served: 4, runtime_failed: 2, verified: 1 })
  assert.deepEqual(trace.runtimeFailedReasons, { 'runtime_deadline_exceeded:idle': 1, 'runtime_deadline_exceeded:running': 1 })
  const s = trace.servedProduction
  assert.equal(s.total, 3, 'only served production_request rows; shadow work is never verifiable')
  assert.equal(s.withHarnessRunId, 1)
  assert.equal(s.turnFoundInChat, 1)
  assert.equal(s.turnNotFoundInChat, 2)
  assert.equal(s.distinctChatUsers, 1)
  assert.equal(s.withAnyTurnOutcome, 2)
  assert.equal(s.withProductionVerifiedOutcome, 1, 'only a decided production_verified outcome counts')
  assert.deepEqual(trace.servingFailures.byOutcome, { empty: 1, timeout: 1 })
  assert.deepEqual(trace.servingFailures.byErrorClass, { 'runtime_deadline_exceeded:idle': 1, unclassified: 1 })
  assert.doesNotMatch(JSON.stringify(trace), /u1/, 'user ids never leave the trace')
  assert.match(describeWorkforceTrace(trace), /turnNotFoundInChat=2/)
})

test('error classes are reduced to their family so per-endpoint detail does not fragment the counts', () => {
  assert.equal(errorClassFamily('runtime_deadline_exceeded:idle:gate=warm@3s'), 'runtime_deadline_exceeded:idle')
  assert.equal(errorClassFamily('TypeError'), 'TypeError')
  assert.equal(errorClassFamily(''), 'unclassified')
})

test('the trace route is read only by construction and cron-authorized, and the watchdog prints it', () => {
  const route = read('../app/api/cron/cos-workforce-verification-trace/route.ts')
  assert.match(route, /db: readOnlyDb\(service\)/)
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
  assert.match(route, /process\.env\.CRON_SECRET/)
  const lib = read('../lib/ai/cos/cosWorkforceVerificationTrace.ts')
  assert.doesNotMatch(lib, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
  const workflow = read('../../.github/workflows/assembly-line-live-proof.yml')
  assert.match(workflow, /cos-workforce-verification-trace/)
})

test('an unreadable lookup is reported as unavailable, never as a zero', () => {
  const trace = composeWorkforceTrace({
    now: NOW, truncated: false, chatTurns: [], turnOutcomes: [], attempts: [],
    assignments: [{ status: 'served', source_kind: 'production_request', source_ref: T(1) }],
    unavailable: { chatHistory: 'canceling statement due to statement timeout' },
  })
  assert.equal(trace.unavailable.chatHistory, 'canceling statement due to statement timeout')
  assert.match(describeWorkforceTrace(trace), /UNAVAILABLE \(counts above are unknown, not zero\): chatHistory/)
})
test('distinct chat users counts only users of served production turns', () => {
  const trace = composeWorkforceTrace({
    now: NOW, truncated: false, turnOutcomes: [], attempts: [],
    assignments: [
      { status: 'served', source_kind: 'production_request', source_ref: T(1) },
      { status: 'runtime_failed', source_kind: 'production_request', source_ref: T(2) },
    ],
    chatTurns: [{ user_id: 'u1', turn_id: T(1) }, { user_id: 'u2', turn_id: T(2) }],
  })
  assert.equal(trace.servedProduction.distinctChatUsers, 1)
})

test('a truncated serving-failure read is disclosed, not presented as the complete window', () => {
  const trace = composeWorkforceTrace({
    now: NOW, truncated: false, chatTurns: [], turnOutcomes: [], assignments: [],
    attempts: [{ phase: 'attempt_failed', outcome: 'timeout', error_class: 'x' }],
    attemptsTruncated: true,
  })
  assert.equal(trace.servingFailures.truncated, true)
  assert.match(describeWorkforceTrace(trace), /serving failures 7d: read=1\+ \(truncated\)/)
})

// end of saas/tests/cosWorkforceVerificationTrace.node.test.ts (if this line is missing, the paste was cut short)
