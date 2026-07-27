// saas/tests/supervisorIncidentRuntime.node.test.ts
//
// The production caller. The single most important test in this file is the last
// one: a signed webhook delivery driven all the way through the REAL
// SupervisorOrchestrator and the REAL default policy engine, proving that a
// destructive repair proposed in response to an inbound alert is blocked rather than
// executed. Everything above it exists so that path stays trustworthy under retries,
// store outages and handler crashes.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createIncidentRuntime,
  createInMemoryIncidentRecordStore,
  IncidentRuntimeConfigError,
  type IncidentRunOutcome,
} from '../lib/supervisor/portable/incident-runtime.ts'
import { createIncidentSource, createInMemoryDedupeStore } from '../lib/supervisor/portable/incident-source.ts'
import { createSignedWebhookSource, signIntakeRequest, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '../lib/supervisor/portable/webhook-intake.ts'
import { SupervisorOrchestrator } from '../lib/supervisor/orchestrator.ts'
import { DefaultSupervisorPolicyEngine } from '../lib/supervisor/policy-engine.ts'
import type { AuditEvent } from '../lib/supervisor/execution-contracts.ts'

const FIXED_NOW = new Date('2026-07-27T12:00:00.000Z')
const SECRET = 'a-sufficiently-long-signing-secret'

const testSource = (overrides: Record<string, unknown> = {}) => createIncidentSource({
  sourceId: 'test-source',
  vendor: 'test',
  status: 'live',
  map: (body: unknown) => {
    const b = body as Record<string, unknown>
    if (b.resolved) return null
    return { provider: 'acme', errorMessage: String(b.message ?? 'boom'), environment: 'production', dedupeKey: b.key as string | undefined }
  },
  ...overrides,
})

const delivery = (body: unknown) => ({ headers: {}, rawBody: JSON.stringify(body), receivedAt: FIXED_NOW.toISOString() })

const ok = (): IncidentRunOutcome => ({ status: 'completed', reason: 'repair verified' })

test('carries an accepted incident into the handler and records the outcome', async () => {
  const seen: string[] = []
  const records = createInMemoryIncidentRecordStore()
  const runtime = createIncidentRuntime({
    sources: [testSource()],
    handler: incident => { seen.push(incident.incidentId); return ok() },
    records,
    now: () => FIXED_NOW,
  })

  const result = await runtime.deliver('test-source', delivery({ message: 'queue stalled', key: 'a' }))

  assert.equal(result.status, 'handled')
  if (result.status !== 'handled') return
  assert.equal(result.replayed, false)
  assert.equal(result.record.status, 'completed')
  assert.equal(result.record.provider, 'acme')
  assert.equal(result.record.vendor, 'test')
  assert.equal(seen.length, 1)
  assert.equal(records.all().length, 1)
})

test('a vendor retry returns the original outcome without diagnosing twice', async () => {
  // This is the property that keeps a retrying monitoring vendor from causing a
  // second execution of the same repair.
  let handled = 0
  const records = createInMemoryIncidentRecordStore()
  const runtime = createIncidentRuntime({
    sources: [testSource()],
    handler: () => { handled += 1; return ok() },
    records,
    // No dedupe store bound, so intake accepts both deliveries — idempotency here
    // must come from the record store, not from deduplication.
    now: () => FIXED_NOW,
  })

  const first = await runtime.deliver('test-source', delivery({ message: 'same alert', key: 'k1' }))
  const second = await runtime.deliver('test-source', delivery({ message: 'same alert', key: 'k1' }))

  assert.equal(first.status === 'handled' && first.replayed, false)
  assert.equal(second.status === 'handled' && second.replayed, true)
  assert.equal(handled, 1, 'the handler must run exactly once for one incident')
  assert.equal(runtime.health().replayed, 1)
})

test('intake deduplication stops a repeat before the runtime ever sees it', async () => {
  let handled = 0
  const runtime = createIncidentRuntime({
    sources: [testSource({ sourceId: 'deduped' })],
    handler: () => { handled += 1; return ok() },
    now: () => FIXED_NOW,
  })
  // Rebuild with a dedupe store bound to the source itself.
  const deduped = createIncidentRuntime({
    sources: [createIncidentSource({
      sourceId: 'deduped',
      vendor: 'test',
      status: 'live',
      map: (body: unknown) => ({ provider: 'acme', errorMessage: String((body as Record<string, unknown>).message), environment: 'production' }),
    }, { dedupe: createInMemoryDedupeStore() })],
    handler: () => { handled += 1; return ok() },
    now: () => FIXED_NOW,
  })
  void runtime

  await deduped.deliver('deduped', delivery({ message: 'flapping check' }))
  const second = await deduped.deliver('deduped', delivery({ message: 'flapping check' }))

  assert.equal(second.status, 'duplicate')
  assert.equal(handled, 1)
})

test('a throwing handler is recorded as a terminal state, not lost', async () => {
  // An unrecorded crash looks identical to an alert that was never sent. That is the
  // worst possible failure mode for an on-call operator.
  const records = createInMemoryIncidentRecordStore()
  const runtime = createIncidentRuntime({
    sources: [testSource()],
    handler: () => { throw new Error('thinker provider unreachable') },
    records,
    now: () => FIXED_NOW,
  })

  const result = await runtime.deliver('test-source', delivery({ message: 'db down' }))

  assert.equal(result.status, 'handled')
  if (result.status !== 'handled') return
  assert.equal(result.record.status, 'handler_error')
  assert.equal(result.record.reason, 'thinker provider unreachable')
  assert.equal(records.all().length, 1, 'the failure is still durably recorded')
  assert.equal(runtime.health().handlerErrors, 1)
  assert.equal(runtime.health().lastHandlerError, 'thinker provider unreachable')
})

test('a record store outage degrades to at-least-once rather than dropping the incident', async () => {
  let handled = 0
  const runtime = createIncidentRuntime({
    sources: [testSource()],
    handler: () => { handled += 1; return ok() },
    records: { async find() { throw new Error('store down') }, async save() { throw new Error('store down') } },
    now: () => FIXED_NOW,
  })

  const result = await runtime.deliver('test-source', delivery({ message: 'still needs handling' }))
  assert.equal(result.status, 'handled', 'a store outage must not drop a live incident')
  assert.equal(handled, 1)
})

test('rejected, ignored and unknown-source deliveries never reach the handler', async () => {
  let handled = 0
  const runtime = createIncidentRuntime({
    sources: [testSource()],
    handler: () => { handled += 1; return ok() },
    now: () => FIXED_NOW,
  })

  const ignored = await runtime.deliver('test-source', delivery({ resolved: true }))
  const rejected = await runtime.deliver('test-source', { headers: {}, rawBody: 'not json' })
  const unknown = await runtime.deliver('no-such-source', delivery({ message: 'x' }))

  assert.equal(ignored.status, 'ignored')
  assert.equal(rejected.status, 'rejected')
  assert.equal(unknown.status === 'rejected' && unknown.reason, 'unknown_source')
  assert.equal(handled, 0, 'nothing that is not an accepted incident may reach the handler')

  const health = runtime.health()
  assert.equal(health.deliveries, 3)
  assert.equal(health.ignored, 1)
  assert.equal(health.rejected, 2)
  assert.equal(health.handled, 0)
})

test('an onRecord hook that throws cannot fail the run', async () => {
  const runtime = createIncidentRuntime({
    sources: [testSource()],
    handler: ok,
    onRecord: () => { throw new Error('metrics pipeline down') },
    now: () => FIXED_NOW,
  })
  const result = await runtime.deliver('test-source', delivery({ message: 'x' }))
  assert.equal(result.status, 'handled')
})

test('reports health across sources and outcome statuses', async () => {
  const runtime = createIncidentRuntime({
    sources: [testSource(), testSource({ sourceId: 'second', status: 'staged' })],
    handler: incident => (incident.errorMessage.includes('risky') ? { status: 'approval_required', reason: 'awaiting approver' } : ok()),
    now: () => FIXED_NOW,
  })

  await runtime.deliver('test-source', delivery({ message: 'routine', key: '1' }))
  await runtime.deliver('second', delivery({ message: 'risky change', key: '2' }))

  const health = runtime.health()
  assert.equal(health.handled, 2)
  assert.equal(health.byStatus.completed, 1)
  assert.equal(health.byStatus.approval_required, 1)
  assert.equal(health.sources.length, 2)
  assert.equal(health.sources.find(s => s.sourceId === 'second')?.status, 'staged')
  assert.deepEqual(runtime.sourceIds(), ['test-source', 'second'])
})

test('rejects misconfiguration when the runtime is wired', () => {
  assert.throws(() => createIncidentRuntime({ sources: [], handler: ok }), IncidentRuntimeConfigError)
  assert.throws(() => createIncidentRuntime({ sources: [testSource()], handler: undefined as never }), IncidentRuntimeConfigError)
  assert.throws(() => createIncidentRuntime({ sources: [testSource(), testSource()], handler: ok }), IncidentRuntimeConfigError)
})

test('END TO END: a signed webhook alert proposing a destructive repair is BLOCKED by the real policy engine', async () => {
  // No stubs on the decision path. Real signed webhook, real intake, real
  // SupervisorOrchestrator, real DefaultSupervisorPolicyEngine. The Thinker proposes
  // deleting the failing deployment — exactly the kind of "fix" an eager automation
  // would run — and the shipped policy refuses it outright.
  const audit: AuditEvent[] = []
  let executed = 0

  const orchestrator = new SupervisorOrchestrator({
    thinker: {
      proposeRepairPlan: (incident) => ({
        planId: `plan-${incident.incidentId}`,
        incidentId: incident.incidentId,
        diagnosis: 'The deployment is failing health checks and should be replaced',
        confidenceScore: 80,
        requiresBrowser: false,
        riskLevel: 'high',
        targetProvider: incident.provider,
        targetEnvironment: incident.environment,
        steps: [{ stepId: 'step-1', action: 'api_request', description: 'Delete the failing production deployment', protectedAction: false, parameters: { actionId: 'deployment.delete' } }],
        verificationSteps: [{ stepId: 'verify-1', action: 'read', description: 'Read deployment status', protectedAction: false, parameters: {} }],
        generatedAt: FIXED_NOW.toISOString(),
        schemaVersion: 'supervisor-repair-plan-v1',
      }),
    },
    policyEngine: new DefaultSupervisorPolicyEngine(),
    executor: { execute: () => { executed += 1; return { status: 'completed', executedStepIds: ['step-1'], startedAt: FIXED_NOW.toISOString(), finishedAt: FIXED_NOW.toISOString(), summary: 'should never run' } } },
    verifier: { verify: () => ({ status: 'verified', verifiedAt: FIXED_NOW.toISOString(), summary: 'n/a', errors: [] }) },
    audit: { write: event => { audit.push(event) } },
    mode: 'autopilot',
    executionContext: { executionId: 'exec-e2e' },
  })

  const webhook = createSignedWebhookSource({ secret: SECRET, sourceId: 'signed', now: () => FIXED_NOW })
  const records = createInMemoryIncidentRecordStore()
  const runtime = createIncidentRuntime({
    sources: [webhook],
    handler: incident => orchestrator.run(incident),
    records,
    now: () => FIXED_NOW,
  })

  const body = JSON.stringify({ provider: 'acme-monitor', errorMessage: 'production deployment is failing health checks', environment: 'production', severity: 'critical' })
  const timestamp = Math.floor(FIXED_NOW.getTime() / 1000)
  const result = await runtime.deliver('signed', {
    headers: { [TIMESTAMP_HEADER]: String(timestamp), [SIGNATURE_HEADER]: signIntakeRequest(SECRET, timestamp, body) },
    rawBody: body,
  })

  assert.equal(result.status, 'handled')
  if (result.status !== 'handled') return
  assert.equal(result.record.status, 'blocked', 'a destructive repair must never reach execution')
  assert.equal(executed, 0, 'the executor was never called')

  const types = audit.map(e => e.eventType)
  assert.ok(types.includes('incident_received'))
  assert.ok(types.includes('plan_generated'))
  assert.ok(types.includes('policy_evaluated'))
  assert.ok(types.includes('execution_blocked'))
  assert.ok(!types.includes('execution_started'), 'execution must not have started')

  assert.equal(records.all()[0].status, 'blocked', 'the refusal is durably recorded')
})

test('END TO END: a read-only repair is allowed to run and verify', async () => {
  // The mirror of the test above — the same real orchestrator and policy engine let a
  // genuinely safe plan through, so the block above is a decision and not a system
  // that simply refuses everything.
  let executed = 0
  const orchestrator = new SupervisorOrchestrator({
    thinker: { proposeRepairPlan: (incident) => ({
      planId: `plan-${incident.incidentId}`,
      incidentId: incident.incidentId,
      diagnosis: 'The endpoint is unhealthy and needs inspection before any change',
      confidenceScore: 65,
      requiresBrowser: false,
      riskLevel: 'low',
      targetProvider: incident.provider,
      targetEnvironment: 'production',
      steps: [{ stepId: 'step-1', action: 'read', description: 'Read the health endpoint response', protectedAction: false, parameters: {} }],
      verificationSteps: [{ stepId: 'verify-1', action: 'read', description: 'Re-read the health endpoint', protectedAction: false, parameters: {} }],
      generatedAt: FIXED_NOW.toISOString(),
      schemaVersion: 'supervisor-repair-plan-v1',
    }) },
    policyEngine: new DefaultSupervisorPolicyEngine(),
    executor: { execute: ({ approvedStepIds }) => { executed += 1; return { status: 'completed', executedStepIds: [...approvedStepIds], startedAt: FIXED_NOW.toISOString(), finishedAt: FIXED_NOW.toISOString(), summary: 'read complete' } } },
    verifier: { verify: () => ({ status: 'verified', verifiedAt: FIXED_NOW.toISOString(), summary: 'endpoint healthy', errors: [] }) },
    audit: { write: () => {} },
    mode: 'autopilot',
    executionContext: { executionId: 'exec-e2e-2' },
  })

  const runtime = createIncidentRuntime({
    sources: [testSource({ sourceId: 'readonly' })],
    handler: incident => orchestrator.run(incident),
    now: () => FIXED_NOW,
  })

  const result = await runtime.deliver('readonly', delivery({ message: 'endpoint returning 503' }))
  assert.equal(result.status, 'handled')
  assert.equal(result.status === 'handled' && result.record.status, 'completed')
  assert.equal(executed, 1)
})
