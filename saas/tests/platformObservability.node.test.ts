// saas/tests/platformObservability.node.test.ts
//
// Platform observability end to end on the real production SDK setup (@vercel/otel registerOTel, as in
// instrumentation.ts) with an in-memory exporter: one trace from request to queued Builder job to model call and
// tool step; errors recorded on spans; request errors redacted and recorded once; the Supervisor turns them into
// incidents and owns their repair.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerOTel } from '@vercel/otel'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { trace } from '@opentelemetry/api'
import {
  currentTraceId, currentTraceparent, markActiveSpanFailed, withSpan, withTraceparent,
} from '../lib/observability/tracing.ts'
import { createPlatformRequestErrorRecorder, PLATFORM_REQUEST_ERROR_EVENT, recordsSupervisorErrors } from '../lib/observability/requestErrors.ts'
import { agentTraceEvent, emitAgentTrace } from '../lib/observability/agentTrace.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { createGovernedBuilderAiPort } from '../lib/builder/control-adapter.ts'
import {
  PLATFORM_REQUEST_ERROR_CODE, PLATFORM_REQUEST_ERROR_PROBE, PLATFORM_REQUEST_ERROR_SUPERVISED_EVENT,
  platformRequestErrorMonitoringCollector,
} from '../self-healing-host/platform-request-error-monitoring.ts'
import { ownedSiteRepairBlocker } from '../self-healing-host/owned-site-repair-dedupe.ts'
import { createServerErrorSpanProcessor, serverErrorFromSpan } from '../lib/observability/serverErrorSpanProcessor.ts'
import { SpanKind } from '@opentelemetry/api'

const exporter = new InMemorySpanExporter()
registerOTel({ serviceName: 'itmounts-test', spanProcessors: [new SimpleSpanProcessor(exporter)] })
const spans = () => exporter.getFinishedSpans()
const parentOf = (span: any) => span.parentSpanContext?.spanId ?? span.parentSpanId
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('a queued Builder job continues the request trace: slice, model call and tool step share one trace id', async () => {
  exporter.reset()
  let queuedTraceparent: string | null = null
  let requestTraceId: string | null = null
  let requestSpanId = ''
  await withSpan('POST /api/builder', {}, async span => {
    requestTraceId = currentTraceId()
    requestSpanId = span.spanContext().spanId
    queuedTraceparent = currentTraceparent()
  })
  assert.match(String(queuedTraceparent), /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/)
  assert.equal(currentTraceId(), null, 'outside the request nothing is traced')

  // Later, in another request (the scheduler): the slice runs under the stored traceparent.
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('ws-trace', 'app.js', 'console.log(1)')
  const dispatcher = new BuilderV2Dispatcher(workspace, { async run() { return { exitCode: 1, stdout: '', stderr: 'boom', timedOut: false } } })
  const ai = createGovernedBuilderAiPort({ async generate() { return '{"tool":"list_files"}' } }, { maxElapsedMs: 10_000 })
  await withTraceparent(queuedTraceparent, () => withSpan('builder.job.slice', { 'builder.job_id': 'job-1' }, async () => {
    await ai.generate({ systemPrompt: 's', prompt: 'p', maxTokens: 64 })
    const receipt = await dispatcher.dispatch('ws-trace', { tool: 'run_tests', command: 'node app.js' })
    assert.equal(receipt.ok, false)
  }))

  const byName = Object.fromEntries(spans().map(span => [span.name, span]))
  const slice = byName['builder.job.slice'], model = byName['builder.model.generate'], tool = byName['builder.tool']
  for (const span of [slice, model, tool]) assert.equal(span.spanContext().traceId, requestTraceId)
  assert.equal(parentOf(slice), requestSpanId, 'the slice is a child of the request that queued the job')
  assert.equal(parentOf(model), slice.spanContext().spanId)
  assert.equal(parentOf(tool), slice.spanContext().spanId)
  assert.equal(model.attributes['builder.model.max_tokens'], 64)
  assert.ok(Number(model.attributes['builder.model.reply_chars']) > 0)
  assert.deepEqual(
    [tool.attributes['builder.tool'], tool.attributes['builder.tool.ok'], tool.attributes['builder.tool.exit_code'], tool.attributes['builder.tool.error']],
    ['run_tests', false, 1, 'builder_tests_failed'])
  assert.equal(tool.status.code, 0, 'a failing test while debugging is an attribute, not a span error')
  console.log('[proof] trace', requestTraceId, spans().map(span => `${span.name}<-${parentOf(span) ?? 'root'}`).join(' | '))
})

test('errors and failed jobs mark their span; a malformed traceparent starts a new trace instead', async () => {
  exporter.reset()
  const failingAi = createGovernedBuilderAiPort({ async generate() { throw new Error('provider_unavailable') } }, { maxElapsedMs: 10_000 })
  await withSpan('builder.job.slice', {}, async () => {
    await assert.rejects(failingAi.generate({ systemPrompt: 's', prompt: 'p', maxTokens: 8 }), /provider_unavailable/)
    markActiveSpanFailed('builder_v2_total_deadline_exceeded')
  })
  const model = spans().find(span => span.name === 'builder.model.generate')!
  const slice = spans().find(span => span.name === 'builder.job.slice')!
  assert.equal(model.status.code, 2)
  assert.equal(model.events[0]?.name, 'exception')
  assert.equal(slice.status.code, 2)
  assert.equal(slice.attributes['failure.code'], 'builder_v2_total_deadline_exceeded')

  exporter.reset()
  await withTraceparent('00-zz-not-a-trace', () => withSpan('builder.job.slice', {}, async () => undefined))
  await withTraceparent(`00-${'0'.repeat(32)}-${'1'.repeat(16)}-01`, () => withSpan('builder.job.slice', {}, async () => undefined))
  for (const span of spans()) assert.equal(parentOf(span), undefined)
})

test('existing COS agent trace events join the active platform trace', async () => {
  const logged: string[] = []
  const original = console.info
  console.info = (...args: unknown[]) => { logged.push(args.map(String).join(' ')) }
  exporter.reset()
  try {
    await withSpan('POST /api/cos-primary', {}, async () => {
      emitAgentTrace(agentTraceEvent({ traceId: 'harness:run-1', kind: 'model', name: 'cos.response', status: 'succeeded', model: 'qwen' }))
    })
  } finally { console.info = original }
  const span = spans()[0]
  assert.equal(span.events[0].name, 'agent.model')
  assert.equal(span.events[0].attributes?.['agent.trace_id'], 'harness:run-1')
  assert.equal(JSON.parse(logged[0].replace('[itmounts-agent-trace] ', '')).otelTraceId, span.spanContext().traceId)
})

test('a captured request error is recorded once per trace, redacted, and storms are bounded', async () => {
  const rows: any[] = []
  const db = { from(table: string) { assert.equal(table, 'supervisor_audit_events'); return { async upsert(value: unknown, options: any) {
    assert.deepEqual(options, { onConflict: 'event_id', ignoreDuplicates: true }); rows.push(value); return { error: null } } } } }
  let now = Date.parse('2026-10-22T14:00:00Z')
  const record = createPlatformRequestErrorRecorder(db, () => now)
  const error = new Error('upstream refused Bearer sk-live-abcdef1234567890 for postgres://user:pw@db.example:5432/x')
  const first = await record({ error, path: '/api/builder?token=SECRET123&x=1', method: 'post', routePath: '/app/api/builder/route', routeType: 'route', traceId: 'a'.repeat(32) })
  const repeat = await record({ error, path: '/api/builder', method: 'POST', routePath: '/app/api/builder/route', routeType: 'route', traceId: 'b'.repeat(32) })
  now += 61_000
  const later = await record({ error, path: '/api/builder', method: 'POST', routePath: '/app/api/builder/route', routeType: 'route', traceId: 'c'.repeat(32) })
  assert.deepEqual([first, repeat, later], ['recorded', 'throttled', 'recorded'])
  const row = rows[0]
  assert.equal(row.event_type, PLATFORM_REQUEST_ERROR_EVENT)
  assert.equal(row.event_id, `${PLATFORM_REQUEST_ERROR_EVENT}:${'a'.repeat(32)}`)
  assert.equal(row.incident_id, 'a'.repeat(32))
  assert.equal(row.payload.path, '/api/builder', 'the query string never leaves the request')
  assert.equal(row.payload.method, 'POST')
  assert.equal(row.payload.routePath, '/app/api/builder', 'the route file and the route name share one key')
  const stored = JSON.stringify(row)
  for (const secret of ['SECRET123', 'sk-live-abcdef1234567890', 'user:pw']) assert.equal(stored.includes(secret), false, secret)
  console.log('[proof] recorded request error', stored)
})

function auditDb(tables: Record<string, any[]>) {
  return { from: () => {
    const filters: Record<string, unknown> = {}
    const query: any = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters[column] = value; return query },
      gte: () => query, order: () => query,
      limit: async () => ({ data: tables[String(filters.event_type)] ?? [], error: null }),
    }
    return query
  } }
}

test('the Supervisor raises one incident per failing route + error, skips supervised events, and owns the repair', async () => {
  const error = (id: string, routePath: string, code: string, at: string) => ({
    event_id: `${PLATFORM_REQUEST_ERROR_EVENT}:${id}`, occurred_at: at,
    payload: { traceId: id.padEnd(32, '0'), method: 'GET', path: routePath.replace('/app', '').replace('/route', ''), routePath, routeType: 'route', errorCode: code, errorMessage: `${code} happened` },
  })
  const db = auditDb({
    [PLATFORM_REQUEST_ERROR_EVENT]: [
      error('t3', '/app/api/a/route', 'TypeError', '2026-10-22T14:03:00Z'),
      error('t2', '/app/api/a/route', 'TypeError', '2026-10-22T14:02:00Z'),
      error('t1', '/app/api/b/route', 'RangeError', '2026-10-22T14:01:00Z'),
      error('t0', '/app/api/c/route', 'Error', '2026-10-22T14:00:00Z'),
    ],
    [PLATFORM_REQUEST_ERROR_SUPERVISED_EVENT]: [{ payload: { observationEventIds: [`${PLATFORM_REQUEST_ERROR_EVENT}:t0`] } }],
  })
  const collector = platformRequestErrorMonitoringCollector({ db, now: () => new Date('2026-10-22T14:05:00Z') })
  assert.equal(collector.id, PLATFORM_REQUEST_ERROR_PROBE)
  assert.deepEqual(collector.signals, ['api-error-rate'])
  const incidents = await collector.observer.observe({ provider: 'signalboost-platform', environment: 'production' } as any)
  assert.deepEqual(incidents.map(incident => [incident.metadata.routePath, incident.metadata.occurrences]), [['/app/api/a/route', 2], ['/app/api/b/route', 1]])
  const [top] = incidents
  assert.equal(top.errorCode, PLATFORM_REQUEST_ERROR_CODE)
  assert.equal(top.affectedResource, 'route:///app/api/a/route')
  assert.deepEqual([top.metadata.ownedPlatform, top.metadata.recoveryPreauthorized], [true, true])
  assert.deepEqual(top.metadata.traceIds, ['t3'.padEnd(32, '0'), 't2'.padEnd(32, '0')])
  assert.equal(top.evidence.length, 2)
  console.log('[proof] supervisor incident', JSON.stringify({ incidentId: top.incidentId, severity: top.severity, errorMessage: top.errorMessage, traceIds: top.metadata.traceIds }))

  // Repair path: request-error incidents go to the Platform Engineer repository repair; a failed repair is not retried
  // every cycle, only after the suppression window (the other owned-site kinds keep their behaviour).
  const loop = read('../self-healing-host/native-autonomous-loop.ts')
  assert.match(loop, /const requestErrorIncident = isPlatformRequestErrorIncident\(incident\)/)
  assert.match(loop, /: await enqueuePlatformRequestErrorRepair\(incident, diagnostic\.diagnosis\)/)
  const repair = read('../self-healing-host/owned-site-autonomous-repair.ts')
  assert.match(repair, /suppressAfterFailure: kind === 'platform-request-error'/)
  assert.match(repair, /never swallow, hide or stop recording the error to make it disappear/)
  const failedRow = { id: 'job-f', status: 'failed', created_at: '2026-10-22T13:00:00Z', metadata: { selfHealingKey: 'rev1:platform-request-error:/app/api/a/route|TypeError' } }
  const key = 'rev2:platform-request-error:/app/api/a/route|TypeError'
  const nowMs = Date.parse('2026-10-22T14:05:00Z')
  assert.deepEqual(ownedSiteRepairBlocker({ rows: [failedRow], key, nowMs, suppressAfterFailure: true }), { disposition: 'recently_attempted', jobId: 'job-f' })
  assert.equal(ownedSiteRepairBlocker({ rows: [failedRow], key, nowMs }), null)

  const cron = read('../app/api/cron/native-proactive-monitoring/route.ts')
  assert.match(cron, /platformRequestErrorMonitoringCollector\(\{ db \}\)/)
  assert.match(cron, /incident\?\.metadata\?\.nativeProbe !== PLATFORM_REQUEST_ERROR_PROBE \|\| item\.outcome !== 'staged'/)
})

test('platform wiring: instrumentation, model usage, job enqueue and job slices carry the trace', () => {
  const instrumentation = read('../instrumentation.ts')
  assert.match(instrumentation, /registerOTel\(\{ serviceName: 'itmounts', traceSampler: 'always_on', spanProcessors \}\)/)
  assert.match(instrumentation, /if \(process\.env\.NEXT_RUNTIME === 'nodejs'\) \{[\s\S]*?try \{\n\s*const \{ serverErrorSpanProcessor \} = await import\('\.\/lib\/observability\/requestErrorHost\.ts'\)\n\s*spanProcessors\.push\(serverErrorSpanProcessor\(\)\)\n\s*\} catch/)
  assert.match(instrumentation, /export const onRequestError: Instrumentation\.onRequestError/)
  assert.match(read('../lib/ai/localInferenceUsage.ts'), /correlation_id: clean\(record\.context\.correlationId, 240\) \?\? currentTraceId\(\)/)
  const store = read('../lib/builder/job-store.ts')
  assert.match(store, /builderRunLimits: runLimits \} : \{\}\), \.\.\.jobTrace\(\) \}/)
  assert.match(store, /if \(input\.status === 'failed'\) markActiveSpanFailed\(input\.error \|\| 'builder_job_failed'\)/)
  const runner = read('../lib/builder/job-runner.ts')
  assert.match(runner, /const queued = await peekBuilderJob\(jobId, userId\)\.catch\(\(\) => null\)\n\s*return withTraceparent\(queued\?\.metadata\.traceparent, \(\) => withSpan\('builder\.job\.slice'/)
  assert.match(runner, /return withSpan\('builder\.publish\.isolated'/)
})

test('a request a route answered with HTTP 500 itself is recorded; deliberate 502/503/504 and other spans are not', async () => {
  const span = (kind: SpanKind, attributes: Record<string, unknown>, traceId = 'd'.repeat(32)) =>
    ({ kind, attributes, spanContext: () => ({ traceId, spanId: '1'.repeat(16), traceFlags: 1 }) }) as any
  const request = (status: number, extra: Record<string, unknown> = {}) => span(SpanKind.SERVER, {
    'next.span_type': 'BaseServer.handleRequest', 'http.status_code': status, 'http.method': 'POST',
    'http.target': '/api/builder?token=SECRET', 'next.route': '/api/builder', ...extra })
  const handled = serverErrorFromSpan(request(500))!
  assert.deepEqual({ path: handled.path, method: handled.method, routePath: handled.routePath, routeType: handled.routeType, traceId: handled.traceId },
    { path: '/api/builder?token=SECRET', method: 'POST', routePath: '/app/api/builder', routeType: 'response', traceId: 'd'.repeat(32) })
  assert.equal((handled.error as Error).name, 'http_500')
  for (const ignored of [request(503), request(502), request(504), request(200),
    span(SpanKind.CLIENT, { 'next.span_type': 'BaseServer.handleRequest', 'http.status_code': 500 }),
    span(SpanKind.SERVER, { 'next.span_type': 'AppRender.getBodyResult', 'http.status_code': 500 })]) {
    assert.equal(serverErrorFromSpan(ignored), null)
  }

  // The write is awaited by forceFlush (the SDK flushes before the function ends) and lands redacted in the ledger.
  const rows: any[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const recorder = createPlatformRequestErrorRecorder({ from: () => ({ async upsert(value: unknown) { await gate; rows.push(value); return { error: null } } }) })
  const processor = createServerErrorSpanProcessor(recorder)
  processor.onEnd(request(500))
  processor.onEnd(request(503))
  assert.equal(rows.length, 0)
  const flushed = processor.forceFlush()
  release()
  await flushed
  assert.equal(rows.length, 1)
  assert.equal(rows[0].payload.errorCode, 'http_500')
  assert.equal(rows[0].payload.path, '/api/builder')
  assert.equal(rows[0].payload.routePath, '/app/api/builder')
  assert.equal(JSON.stringify(rows[0]).includes('SECRET'), false)
  console.log('[proof] recorded handled 500', JSON.stringify(rows[0].payload))
})

test('only Production errors reach the Supervisor: a preview deployment shares the database but not the repair loop', () => {
  assert.deepEqual(['production', undefined, 'preview', 'development'].map(env => recordsSupervisorErrors(env)), [true, true, false, false])
  assert.match(read('../lib/observability/requestErrorHost.ts'), /async function record\(input: PlatformRequestError\): Promise<void> \{\n\s*if \(!recordsSupervisorErrors\(\)\) return/)
})
