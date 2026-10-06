// saas/tests/cosWorkforceVerificationTrace.node.test.ts
//
// The Workforce verification trace (owner 2026-10-06) explains why served graduate work never becomes a verified
// Production outcome. It is read only, counts only, and never leaks user ids.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  SERVING_PATHS,
  WORKFORCE_TRACE_SCHEMA_VERSION,
  composeServingPaths,
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

const A = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('every serving attempt is placed on a path from assignment links and the fallback phase, never from its deadline', () => {
  const paths = composeServingPaths({
    assignments: [
      { status: 'served', source_kind: 'production_shadow', source_ref: 'shadow:1', serving_attempt_id: A(1) },
      { status: 'runtime_failed', source_kind: 'production_shadow', source_ref: 'shadow:2', serving_attempt_id: A(2) },
      { status: 'served', source_kind: 'production_request', source_ref: T(3), serving_attempt_id: A(3) },
    ],
    attempts: [
      // shadow success after 21s on a 45s deadline
      { attempt_id: A(1), phase: 'attempt_started', outcome: 'pending', timeout_ms: 45000, latency_ms: 0 },
      { attempt_id: A(1), phase: 'attempt_succeeded', outcome: 'success', timeout_ms: 45000, latency_ms: 21000 },
      // shadow timeout on a 20s deadline with a warm endpoint
      { attempt_id: A(2), phase: 'attempt_failed', outcome: 'timeout', error_class: 'runtime_deadline_exceeded:warm:gate', timeout_ms: 20000, latency_ms: 20000 },
      // live chat success, linked by its production_request assignment
      { attempt_id: A(3), phase: 'attempt_succeeded', outcome: 'success', timeout_ms: 8000, latency_ms: 4000 },
      // a fallback on the 8s live-chat deadline: the caller is not recorded, so it is NOT claimed as live chat
      { attempt_id: A(4), phase: 'attempt_failed', outcome: 'timeout', error_class: 'runtime_deadline_exceeded:cold', timeout_ms: 8000, latency_ms: 8000 },
      { attempt_id: A(4), phase: 'fallback', outcome: 'fallback', timeout_ms: 8000, latency_ms: 8000 },
      // a routing-classifier-shaped fallback on a 750ms deadline: same bucket, never live chat
      { attempt_id: A(8), phase: 'attempt_failed', outcome: 'timeout', error_class: 'runtime_deadline_exceeded:warm', timeout_ms: 750, latency_ms: 750 },
      { attempt_id: A(8), phase: 'fallback', outcome: 'fallback', timeout_ms: 750, latency_ms: 750 },
      // a long-deadline caller that came back empty
      { attempt_id: A(5), phase: 'attempt_failed', outcome: 'empty', timeout_ms: 60000, latency_ms: 300 },
      { attempt_id: A(5), phase: 'fallback', outcome: 'fallback', timeout_ms: 60000, latency_ms: 300 },
      // a non-chat success with no assignment row, and an attempt that never recorded an end
      { attempt_id: A(6), phase: 'attempt_succeeded', outcome: 'success', timeout_ms: 30000, latency_ms: 9000 },
      { attempt_id: A(7), phase: 'attempt_started', outcome: 'pending', latency_ms: 0 },
    ],
  })
  assert.deepEqual(SERVING_PATHS, ['live_chat_served', 'workforce_shadow', 'graduate_worker_unattributed', 'unlinked'])
  assert.deepEqual(
    { a: paths.workforce_shadow.attempts, s: paths.workforce_shadow.success, t: paths.workforce_shadow.timeout },
    { a: 2, s: 1, t: 1 },
  )
  assert.deepEqual(paths.workforce_shadow.stateAtTimeout, { warm: 1 })
  assert.deepEqual(paths.workforce_shadow.timeoutMsValues, { 20000: 1, 45000: 1 })
  assert.equal(paths.workforce_shadow.successLatencyP50Ms, 21000)
  assert.deepEqual(
    { a: paths.live_chat_served.attempts, s: paths.live_chat_served.success, t: paths.live_chat_served.timeout, p50: paths.live_chat_served.successLatencyP50Ms },
    { a: 1, s: 1, t: 0, p50: 4000 },
    'only an attempt linked to a production_request assignment is live chat',
  )
  const other = paths.graduate_worker_unattributed
  assert.deepEqual({ a: other.attempts, t: other.timeout, e: other.empty }, { a: 3, t: 2, e: 1 })
  assert.deepEqual(other.timeoutMsValues, { 750: 1, 8000: 1, 60000: 1 }, 'deadlines are reported, the caller is not guessed')
  assert.deepEqual(other.stateAtTimeout, { cold: 1, warm: 1 })
  assert.deepEqual(
    { a: paths.unlinked.attempts, s: paths.unlinked.success, n: paths.unlinked.noTerminal },
    { a: 2, s: 1, n: 1 },
  )
  assert.deepEqual(paths.unlinked.timeoutMsValues, { 30000: 1, unrecorded: 1 })
})

test('success latency percentiles are nearest-rank over successful attempts only', () => {
  const attempts = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000].map((ms, i) => (
    { attempt_id: A(100 + i), phase: 'attempt_succeeded', outcome: 'success', timeout_ms: 45000, latency_ms: ms }
  ))
  const assignments = attempts.map((row, i) => ({ status: 'served', source_kind: 'production_shadow', source_ref: `s:${i}`, serving_attempt_id: row.attempt_id }))
  const paths = composeServingPaths({
    assignments,
    attempts: [...attempts, { attempt_id: A(200), phase: 'attempt_failed', outcome: 'timeout', timeout_ms: 45000, latency_ms: 45000 }],
  })
  assert.equal(paths.workforce_shadow.successLatencyP50Ms, 5000)
  assert.equal(paths.workforce_shadow.successLatencyP90Ms, 9000)
  assert.equal(paths.live_chat_served.successLatencyP50Ms, null, 'no successes reads n/a, never 0')
  assert.deepEqual(paths.unlinked.stateAtTimeout, { unrecorded: 1 }, 'a timeout without a recorded endpoint state is not guessed')
})

test('the path split is printed, its gaps are disclosed, and a missing read is null rather than zeros', () => {
  const base = { now: NOW, truncated: false, chatTurns: [], turnOutcomes: [], attempts: [], assignments: [] }
  assert.equal(composeWorkforceTrace(base).servingPaths, null)
  assert.doesNotMatch(describeWorkforceTrace(composeWorkforceTrace(base)), /serving paths 7d/)
  const trace = composeWorkforceTrace({
    ...base,
    pathAttempts: [{ attempt_id: A(1), phase: 'attempt_succeeded', outcome: 'success', timeout_ms: 8000, latency_ms: 3000 }],
    pathAttemptsTruncated: true,
  })
  const text = describeWorkforceTrace(trace)
  assert.match(text, /serving paths 7d: attemptRows=1\+ \(truncated\) \(live chat that skipped a cold graduate writes no row and is not counted\)/)
  assert.match(text, /unlinked: attempts=1 success=1 .* successP50=3000ms .* deadlineMs 8000=1/)
  assert.match(text, /live_chat_served: attempts=0 .* successP50=n\/a/)
})

test('the trace reads attempt links and every attempt phase, and stays read only', () => {
  const lib = read('../lib/ai/cos/cosWorkforceVerificationTrace.ts')
  assert.match(lib, /select\('status,source_kind,source_ref,failure_reason,harness_run_id,serving_attempt_id'\)/)
  assert.match(lib, /select\('attempt_id,phase,outcome,error_class,timeout_ms,latency_ms'\)/)
  assert.doesNotMatch(lib, /timeoutMs\s*<=/, 'paths are never inferred from a deadline')
})

// end of saas/tests/cosWorkforceVerificationTrace.node.test.ts (if this line is missing, the paste was cut short)
