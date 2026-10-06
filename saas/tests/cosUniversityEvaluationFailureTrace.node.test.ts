// saas/tests/cosUniversityEvaluationFailureTrace.node.test.ts
//
// The evaluation-failure trace (owner 2026-10-06) shows which failure causes are still firing and, for runtime_not_ready,
// which worker stage was reached. Read only, counts only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  EVALUATION_FAILURE_TRACE_SCHEMA_VERSION,
  EVALUATION_READY_WINDOW_SECONDS,
  composeEvaluationFailureTrace,
  composeReadinessWaits,
  describeEvaluationFailureTrace,
  failureDetail,
  failureFamily,
  runtimeStage,
} from '../lib/ai/cos/cosUniversityEvaluationFailureTrace.ts'
import { isEvaluatorInfrastructureFailure } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const NOW = new Date('2026-10-06T12:00:00Z')
const PING = 'mass_distilled_evaluation_runtime_not_ready:mass_distilled_gateway_ping_timeout'

test('families are split by day, last seen and attribution, with the rolling authority deciding infrastructure vs merit', () => {
  const rows = [
    { observed_at: '2026-10-06T11:00:00Z', error: `${PING}:workers=cold` },
    { observed_at: '2026-10-06T10:00:00Z', error: `${PING}:workers=warm` },
    { observed_at: '2026-10-02T10:00:00Z', error: PING },
    { observed_at: '2026-10-01T09:00:00Z', error: 'RunPod GET /serverless HTTP 500: failed to list endpoints' },
    { observed_at: '2026-10-05T09:00:00Z', error: 'mass_distilled_evaluation_candidate_answer_empty:abc12345def:finish=stop' },
    { observed_at: 'not a date', error: PING },
    { observed_at: '2026-10-06T10:00:00Z', error: '' },
  ]
  const trace = composeEvaluationFailureTrace({ rows, truncated: false, now: NOW })
  assert.equal(trace.schemaVersion, EVALUATION_FAILURE_TRACE_SCHEMA_VERSION)
  assert.equal(trace.total, 5, 'rows without a time or an error are not counted')
  const expectedInfra = rows.slice(0, 5).filter(row => isEvaluatorInfrastructureFailure(row.error)).length
  assert.equal(trace.infrastructure, expectedInfra)
  const ping = trace.families.find(f => f.family === PING)!
  assert.equal(ping.total, 3)
  assert.equal(ping.last24h, 2)
  assert.equal(ping.lastSeenAt, '2026-10-06T11:00:00.000Z')
  assert.equal(ping.perDay['2026-10-06'], 2)
  assert.equal(ping.perDay['2026-10-02'], 1)
  assert.deepEqual(trace.runtimeNotReadyStages, { cold: 1, initializing: 0, warm: 1, unknown: 0, unrecorded: 1 })
  const listing = trace.families.find(f => f.family.startsWith('RunPod GET /serverless'))!
  assert.equal(listing.last24h, 0, 'a cause that stopped days ago is visible as stopped')
  assert.equal(trace.days.length, 8)
  const text = describeEvaluationFailureTrace(trace)
  assert.match(text, /runtime_not_ready worker stage: cold=1 initializing=0 warm=1 unknown=0 unrecorded=1/)
  assert.ok(trace.families.some(f => f.family === 'mass_distilled_evaluation_candidate_answer_empty:<case>'), 'per-case hashes collapse into one family')
  assert.doesNotMatch(text, /abc12345/, 'per-case identifiers never appear')
})

test('family key matches the Step 1 report and the stage is read from the suffix', () => {
  assert.equal(failureFamily(`${PING}:workers=warm`), PING)
  assert.equal(runtimeStage(`${PING}:workers=initializing`), 'initializing')
  assert.equal(runtimeStage(PING), 'unrecorded')
  assert.equal(failureFamily('mass_distilled_evaluation_answer_missing:2ebc8bff9f2052e9:finish=length'), 'mass_distilled_evaluation_answer_missing:<case>')
  assert.equal(failureFamily('RunPod GET /serverless HTTP 500: failed'), 'RunPod GET /serverless HTTP 500: failed')
})

test('a truncated read is disclosed', () => {
  const trace = composeEvaluationFailureTrace({ rows: [], truncated: true, now: NOW })
  assert.match(describeEvaluationFailureTrace(trace), /total=0\+ \(truncated\)/)
})

test('the route is read only by construction and cron-authorized, and the watchdog publishes it', () => {
  const route = read('../app/api/cron/cos-university-evaluation-failure-trace/route.ts')
  assert.match(route, /db: readOnlyDb\(service\)/)
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
  assert.match(route, /process\.env\.CRON_SECRET/)
  const lib = read('../lib/ai/cos/cosUniversityEvaluationFailureTrace.ts')
  assert.doesNotMatch(lib, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
  const workflow = read('../../.github/workflows/assembly-line-live-proof.yml')
  assert.match(workflow, /cos-university-evaluation-failure-trace/)
  assert.match(workflow, /## Evaluation failure trace/)
})
test('each family keeps its most frequent full patterns, with case hashes blanked', () => {
  const miss = (id: string, finish: string) => `mass_distilled_evaluation_answer_missing:${id}:finish=${finish}:think=0:open=1:close=0:other=0:cap=1024`
  const trace = composeEvaluationFailureTrace({
    now: NOW, truncated: false,
    rows: [
      { observed_at: '2026-10-06T11:00:00Z', error: miss('2ebc8bff9f2052e9', 'length') },
      { observed_at: '2026-10-06T10:00:00Z', error: miss('11ac1c1ab6737974', 'length') },
      { observed_at: '2026-10-05T10:00:00Z', error: miss('0dd3a06139d667e2', 'stop') },
    ],
  })
  const family = trace.families.find(f => f.family === 'mass_distilled_evaluation_answer_missing:<case>')!
  assert.deepEqual(family.details.map(d => [d.count, d.detail]), [
    [2, 'mass_distilled_evaluation_answer_missing:<case>:finish=length:think=0:open=1:close=0:other=0:cap=1024'],
    [1, 'mass_distilled_evaluation_answer_missing:<case>:finish=stop:think=0:open=1:close=0:other=0:cap=1024'],
  ])
  const text = describeEvaluationFailureTrace(trace)
  assert.match(text, /2 x mass_distilled_evaluation_answer_missing:<case>:finish=length/)
  assert.doesNotMatch(text, /2ebc8bff9f2052e9/)
  assert.equal(failureDetail('RunPod PATCH /serverless/zp1tvf6v8cmhbu HTTP 400'), 'RunPod PATCH /serverless/zp1tvf6v8cmhbu HTTP 400', 'non-hex ids are kept')
})

test('completed-exam readiness waits are compared with the readiness window, and missing values are not zeros', () => {
  const waits = composeReadinessWaits([
    { observed_at: 'x', readiness_seconds: '45' },
    { observed_at: 'x', readiness_seconds: '130' },
    { observed_at: 'x', readiness_seconds: '250' },
    { observed_at: 'x', readiness_seconds: null },
  ])
  assert.equal(waits.completed, 4)
  assert.equal(waits.withReadiness, 3)
  assert.equal(waits.p50, 130)
  assert.equal(waits.max, 250)
  assert.equal(waits.windowSeconds, EVALUATION_READY_WINDOW_SECONDS)
  assert.deepEqual(waits.withinSeconds, { '60': 1, '120': 1, '180': 2, '240': 2, '280': 3 })
  const trace = composeEvaluationFailureTrace({ rows: [], truncated: false, now: NOW, completed: null })
  assert.match(describeEvaluationFailureTrace(trace), /completed-exam readiness wait: unavailable/)
})

// end of saas/tests/cosUniversityEvaluationFailureTrace.node.test.ts (if this line is missing, the paste was cut short)
