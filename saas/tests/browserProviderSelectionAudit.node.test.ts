import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  BROWSER_PROVIDER_SELECTION_EXPLANATION_SCHEMA_VERSION,
  BrowserProviderSelectionAuditError,
  createBrowserProviderSelectionAuditEvent,
  explainBrowserProviderSelection,
  selectBrowserProviderExecutionWithAudit,
  type ExecutionDecision,
  type SelectBrowserProviderExecutionWithAuditInput,
} from '../lib/supervisor/index.ts'
import {
  BROWSER_PROVIDER_DIAGNOSTICS_SCHEMA_VERSION,
  createBrowserProviderDiagnosticsSnapshot,
} from '../lib/browser-provider/index.ts'
import {
  InMemoryExecutionRecordStore,
} from '../lib/supervisor/persistence/execution-record-store.ts'
import {
  auditRecordSchemaVersion,
} from '../lib/supervisor/persistence/audit-record-schema.ts'
import {
  executionRecordSchemaVersion,
} from '../lib/supervisor/persistence/execution-record-schema.ts'

function browserDecision(overrides: Partial<ExecutionDecision> = {}): ExecutionDecision {
  return {
    decisionId: 'decision-work-1-7-use_browser_with_guardrails',
    workItemId: 'work-1',
    selectedChannel: 'browser',
    executionMode: 'browser_on_demand',
    decisionCode: 'use_browser_with_guardrails',
    browserReason: { reason: 'human_requested', requestingOperatorId: 'operator-1' },
    capabilityId: 'read_deployment_status',
    capabilityVersion: 'vercel-browser-capabilities-v1',
    policyVersion: 'ha-policy-v1',
    riskClass: 'read_only',
    maturity: 'sandbox_verified',
    approvedStepIds: [],
    requiresHumanApproval: true,
    verificationProfileId: 'deployment_status_visible',
    ownerInstanceId: 'supervisor-1',
    ownerRuntimeId: 'runtime-1',
    fencingToken: 7,
    decidedAt: '2026-07-17T01:00:00.000Z',
    expiresAt: '2026-07-17T01:01:00.000Z',
    auditMetadata: { environment: 'sandbox' },
    schemaVersion: 'execution-channel-decision-v1',
    ...overrides,
  }
}

function auditedSelectionInput(
  overrides: Partial<SelectBrowserProviderExecutionWithAuditInput> = {},
): SelectBrowserProviderExecutionWithAuditInput {
  return {
    incidentId: 'incident-1',
    providerId: 'vercel',
    executionId: 'execution-1',
    dispatchId: 'dispatch-1',
    workItemId: 'work-1',
    executionMode: 'browser_on_demand',
    capabilityId: 'read_deployment_status',
    capabilityVersion: 'vercel-browser-capabilities-v1',
    environment: 'sandbox',
    apiAttempted: false,
    retryCount: 0,
    maxRetries: 1,
    browserReason: { reason: 'human_requested', requestingOperatorId: 'operator-1' },
    ownerInstanceId: 'supervisor-1',
    ownerRuntimeId: 'runtime-1',
    fencingToken: 7,
    now: new Date('2026-07-17T01:00:00.000Z'),
    ...overrides,
  }
}

async function createAuditExecution(store: InMemoryExecutionRecordStore): Promise<void> {
  const now = '2026-07-17T01:00:00.000Z'
  await store.createExecution({
    executionId: 'execution-1',
    dispatchId: 'dispatch-1',
    incidentId: 'incident-1',
    planId: 'plan-1',
    provider: 'vercel',
    targetEnvironment: 'sandbox',
    targetOrigin: 'https://vercel.com',
    executorKind: 'browser',
    executionMode: 'dry_run',
    status: 'requested',
    verificationStatus: 'pending',
    checkpointStatus: 'none',
    approvedStepIds: [],
    completedStepIds: [],
    skippedStepIds: [],
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    schemaVersion: executionRecordSchemaVersion,
    metadata: {},
  })
}

test('BPAL capability selection explanation is deterministic, detached, and deeply frozen', () => {
  const snapshot = createBrowserProviderDiagnosticsSnapshot()
  const decision = browserDecision()
  const first = explainBrowserProviderSelection({ providerId: 'vercel', decision, diagnosticsSnapshot: snapshot })
  const second = explainBrowserProviderSelection({ providerId: 'vercel', decision, diagnosticsSnapshot: snapshot })

  assert.equal(first.schemaVersion, BROWSER_PROVIDER_SELECTION_EXPLANATION_SCHEMA_VERSION)
  assert.equal(first.diagnosticsSchemaVersion, BROWSER_PROVIDER_DIAGNOSTICS_SCHEMA_VERSION)
  assert.equal(first.providerId, 'vercel')
  assert.equal(first.capabilityId, 'read_deployment_status')
  assert.equal(first.selectedChannel, 'browser')
  assert.equal(first.navigationProfileId, 'vercel_deployments')
  assert.equal(first.evidenceProfileId, 'deployment_success')
  assert.equal(first.verificationProfileId, 'deployment_status_visible')
  assert.deepEqual(first.originIds, ['vercel_dashboard'])
  assert.deepEqual(first.exactOrigins, ['https://vercel.com'])
  assert.ok(first.reasonCodes.includes('browser_on_demand_selected'))
  assert.ok(first.reasonCodes.includes('human_approval_required'))
  assert.ok(first.reasonCodes.includes('production_browser_execution_disabled'))
  assert.equal(first.productionExecutionEnabled, false)
  assert.equal(JSON.stringify(first), JSON.stringify(second))
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.reasonCodes))
  assert.throws(() => (first.reasonCodes as unknown as string[]).push('policy_blocked'), /read only|not extensible|object is not extensible/i)
})

test('BPAL selection explanation becomes a valid durable Supervisor audit event', async () => {
  const event = createBrowserProviderSelectionAuditEvent({
    incidentId: 'incident-1',
    executionId: 'execution-1',
    dispatchId: 'dispatch-1',
    providerId: 'vercel',
    decision: browserDecision(),
  })
  const reboundEvent = createBrowserProviderSelectionAuditEvent({
    incidentId: 'incident-2',
    executionId: 'execution-1',
    dispatchId: 'dispatch-1',
    providerId: 'vercel',
    decision: browserDecision(),
  })
  const equivalentTimeEvent = createBrowserProviderSelectionAuditEvent({
    incidentId: 'incident-1',
    executionId: 'execution-1',
    dispatchId: 'dispatch-1',
    providerId: 'vercel',
    decision: browserDecision(),
    occurredAt: '2026-07-16T18:00:00-07:00',
  })
  const emptyOptionalIdsEvent = createBrowserProviderSelectionAuditEvent({
    incidentId: 'incident-1',
    executionId: '',
    dispatchId: '',
    providerId: 'vercel',
    decision: browserDecision(),
  })
  const omittedOptionalIdsEvent = createBrowserProviderSelectionAuditEvent({
    incidentId: 'incident-1',
    providerId: 'vercel',
    decision: browserDecision(),
  })

  assert.match(event.eventId, /^browser-provider-selection:[a-f0-9]{64}$/)
  assert.notEqual(event.eventId, reboundEvent.eventId)
  assert.equal(event.eventId, equivalentTimeEvent.eventId)
  assert.equal(equivalentTimeEvent.occurredAt, '2026-07-17T01:00:00.000Z')
  assert.equal(emptyOptionalIdsEvent.eventId, omittedOptionalIdsEvent.eventId)
  assert.equal(emptyOptionalIdsEvent.executionId, undefined)
  assert.equal(emptyOptionalIdsEvent.dispatchId, undefined)
  assert.equal(event.eventType, 'browser_provider_capability_selection_explained')
  assert.equal(event.schemaVersion, auditRecordSchemaVersion)
  assert.equal(event.incidentId, 'incident-1')
  assert.equal(event.executionId, 'execution-1')
  assert.equal(event.dispatchId, 'dispatch-1')
  assert.equal(event.payload.productionExecutionEnabled, false)
  assert.equal(event.payload.providerId, 'vercel')
  assert.ok(Object.isFrozen(event))
  assert.ok(Object.isFrozen(event.payload))

  const store = new InMemoryExecutionRecordStore()
  await store.appendAuditEvent(event)
  await store.appendAuditEvent(event)
})

test('governed BPAL selector persists its explanation before returning a decision', async () => {
  const store = new InMemoryExecutionRecordStore()
  await createAuditExecution(store)

  const selected = await selectBrowserProviderExecutionWithAudit(
    { auditStore: store },
    auditedSelectionInput(),
  )

  assert.equal(selected.decision.selectedChannel, 'browser')
  assert.equal(selected.decision.decisionCode, 'use_browser_with_guardrails')
  assert.deepEqual(selected.decision.approvedStepIds, [])
  assert.equal(selected.explanation.providerId, 'vercel')
  assert.equal(selected.explanation.productionExecutionEnabled, false)
  assert.equal(selected.auditEvent.executionId, 'execution-1')
  assert.ok(Object.isFrozen(selected))
  assert.ok(Object.isFrozen(selected.decision))
  assert.ok(Object.isFrozen(selected.decision.auditMetadata))

  const detail = await store.getExecution('execution-1')
  assert.equal(detail?.auditEvents.length, 1)
  assert.equal(detail?.auditEvents[0]?.eventType, 'browser_provider_capability_selection_explained')
  assert.equal(detail?.auditEvents[0]?.payload.decisionId, selected.decision.decisionId)
})

test('governed BPAL selector fails closed when durable audit persistence fails', async () => {
  let appendCalls = 0
  const auditStore = {
    async appendAuditEvent() {
      appendCalls += 1
      throw new Error('audit store unavailable')
    },
  }

  await assert.rejects(
    () => selectBrowserProviderExecutionWithAudit(
      { auditStore },
      auditedSelectionInput({ executionId: undefined }),
    ),
    /audit store unavailable/,
  )
  assert.equal(appendCalls, 1)
})

test('governed BPAL selector rejects cross-provider capability scope before audit append', async () => {
  let appendCalls = 0
  const auditStore = {
    async appendAuditEvent() {
      appendCalls += 1
    },
  }

  await assert.rejects(
    () => selectBrowserProviderExecutionWithAudit(
      { auditStore },
      auditedSelectionInput({ capabilityId: 'forged-capability' }),
    ),
    (error: unknown) => error instanceof BrowserProviderSelectionAuditError && error.code === 'unknown_capability',
  )
  assert.equal(appendCalls, 0)
})

test('governed BPAL selector records manual review instead of enabling production Browser execution', async () => {
  const events: unknown[] = []
  const selected = await selectBrowserProviderExecutionWithAudit(
    {
      auditStore: {
        async appendAuditEvent(event) {
          events.push(event)
        },
      },
    },
    auditedSelectionInput({
      executionId: undefined,
      environment: 'production',
    }),
  )

  assert.equal(selected.decision.selectedChannel, 'manual')
  assert.equal(selected.decision.decisionCode, 'require_human_approval')
  assert.equal(selected.explanation.environment, 'production')
  assert.equal(selected.explanation.productionExecutionEnabled, false)
  assert.ok(selected.explanation.reasonCodes.includes('human_approval_required'))
  assert.equal(events.length, 1)
})

test('BPAL selection audit preserves manual explanations when production Browser execution is denied', () => {
  const explanation = explainBrowserProviderSelection({
    providerId: 'vercel',
    decision: browserDecision({
      selectedChannel: 'manual',
      decisionCode: 'require_human_approval',
      auditMetadata: { environment: 'production' },
    }),
  })

  assert.equal(explanation.environment, 'production')
  assert.equal(explanation.selectedChannel, 'manual')
  assert.ok(explanation.reasonCodes.includes('human_approval_required'))
  assert.ok(explanation.reasonCodes.includes('production_browser_execution_disabled'))
  assert.equal(explanation.productionExecutionEnabled, false)
})

test('BPAL selection audit fails closed on mismatched or forbidden Browser decisions', () => {
  assert.throws(
    () => explainBrowserProviderSelection({
      providerId: 'vercel',
      decision: browserDecision({ capabilityVersion: 'tampered-version' }),
    }),
    (error: unknown) => error instanceof BrowserProviderSelectionAuditError && error.code === 'decision_binding_mismatch',
  )

  assert.throws(
    () => explainBrowserProviderSelection({
      providerId: 'vercel',
      decision: browserDecision({ approvedStepIds: ['save-production'] }),
    }),
    (error: unknown) => error instanceof BrowserProviderSelectionAuditError && error.code === 'decision_binding_mismatch',
  )

  assert.throws(
    () => explainBrowserProviderSelection({
      providerId: 'vercel',
      decision: browserDecision({ auditMetadata: { environment: 'production' } }),
    }),
    (error: unknown) => error instanceof BrowserProviderSelectionAuditError && error.code === 'environment_not_allowed',
  )

  assert.throws(
    () => explainBrowserProviderSelection({
      providerId: 'vercel',
      decision: browserDecision({ decisionCode: 'use_browser_automatically', executionMode: 'smart_failover' }),
    }),
    (error: unknown) => error instanceof BrowserProviderSelectionAuditError && error.code === 'browser_auto_failover_not_allowed',
  )

  assert.throws(
    () => explainBrowserProviderSelection({
      providerId: 'vercel',
      decision: browserDecision({ decisionCode: 'use_api' }),
    }),
    (error: unknown) => error instanceof BrowserProviderSelectionAuditError && error.code === 'decision_channel_mismatch',
  )
})

test('BPAL selection audit remains metadata-only and non-executing', async () => {
  const source = await readFile(new URL('../lib/supervisor/browser-provider-selection-audit.ts', import.meta.url), 'utf8')
  const selectorSource = await readFile(new URL('../lib/supervisor/browser-provider-audited-selector.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /playwright|chromium|browserSession|secretResolver|credentialRef|authorization|fetch\(|provider sdk/i)
  assert.doesNotMatch(selectorSource, /playwright|chromium|browserSession|secretResolver|credentialRef|authorization|fetch\(|provider sdk/i)
  assert.match(source, /productionExecutionEnabled: false/)
  assert.match(source, /parseAuditEvent/)
  assert.match(selectorSource, /appendAuditEvent/)
})
