import assert from 'node:assert/strict'
import test from 'node:test'
import { InMemoryExecutionRecordStore, auditRecordSchemaVersion, executionRecordSchemaVersion, parseExecutionRecord, sanitizeForPersistence } from '../lib/supervisor/persistence/index.ts'

const now = '2026-07-16T00:00:00.000Z'
function rec(id = 'exec-1') { return { executionId:id, dispatchId:'dispatch-1', incidentId:'incident-1', planId:'plan-1', packageId:'pkg-1', packageFingerprint:'fp', provider:'signalboost-sandbox', targetEnvironment:'sandbox', targetOrigin:'http://localhost:4173', executorKind:'browser', executionMode:'sandbox_execute', status:'requested', verificationStatus:'pending', checkpointStatus:'none', approvedStepIds:['step-1','step-2'], completedStepIds:[], skippedStepIds:[], startedAt:now, createdAt:now, updatedAt:now, schemaVersion:executionRecordSchemaVersion, metadata:{} } }
function event(id = 'event-1') { return { eventId:id, executionId:'exec-1', dispatchId:'dispatch-1', incidentId:'incident-1', eventType:'sandbox_execution_started', occurredAt:now, payload:{ ok:true }, schemaVersion:auditRecordSchemaVersion, createdAt:now } }

test('execution records validate and reject production/non-serializable browser handles', () => {
  assert.equal(parseExecutionRecord(rec()).executionId, 'exec-1')
  assert.throws(() => parseExecutionRecord({ ...rec(), targetEnvironment:'production' }), /Only sandbox/)
  const sanitized = sanitizeForPersistence({ authorization:'Bearer supersecret', page: new Date(), nested:{ password:'p' } })
  assert.deepEqual(sanitized, { redacted:'[redacted]', page:'[non-serializable]', nested:{ redacted:'[redacted]' } })
})

test('duplicate execution IDs fail closed and identity cannot be mutated', async () => {
  const store = new InMemoryExecutionRecordStore()
  await store.createExecution(rec())
  await assert.rejects(() => store.createExecution(rec()), /Duplicate executionId/)
  await store.updateExecutionStatus('exec-1', { status:'started' })
  const detail = await store.getExecution('exec-1')
  assert.equal(detail?.execution.dispatchId, 'dispatch-1')
})

test('valid and invalid status transitions are centralized', async () => {
  const store = new InMemoryExecutionRecordStore()
  await store.createExecution(rec())
  await store.updateExecutionStatus('exec-1', { status:'started' })
  await store.recordCheckpoint('exec-1', 'step-1', now)
  await store.recordContinuation('exec-1', now)
  await assert.rejects(() => store.updateExecutionStatus('exec-1', { status:'completed', verificationStatus:'failed' }), /Completed executions require verified/)
  await store.updateExecutionStatus('exec-1', { status:'completed', verificationStatus:'verified', completedAt:now })
  await assert.rejects(() => store.updateExecutionStatus('exec-1', { status:'started' }), /Invalid execution status transition/)
})

test('verification failure cannot become completed and continuation requires paused state', async () => {
  const store = new InMemoryExecutionRecordStore()
  await store.createExecution(rec())
  await store.updateExecutionStatus('exec-1', { status:'started' })
  await assert.rejects(() => store.recordContinuation('exec-1', now), /Continuation requires paused/)
  await store.updateExecutionStatus('exec-1', { status:'verification_failed', verificationStatus:'failed', failedAt:now })
  await assert.rejects(() => store.updateExecutionStatus('exec-1', { status:'completed', verificationStatus:'verified' }), /Invalid execution status transition/)
})

test('evidence step IDs must remain within approved scope', async () => {
  const store = new InMemoryExecutionRecordStore()
  await store.createExecution(rec())
  await assert.rejects(() => store.attachEvidenceReference({ evidenceId:'ev-1', executionId:'exec-1', stepId:'not-approved', evidenceType:'screenshot', artifactReference:'artifact://safe', capturedAt:now, metadata:{}, schemaVersion:auditRecordSchemaVersion }), /Evidence step not in approved/)
  await store.attachEvidenceReference({ evidenceId:'ev-2', executionId:'exec-1', stepId:'step-1', evidenceType:'screenshot', artifactReference:'artifact://safe', capturedAt:now, metadata:{ mime:'image/png' }, schemaVersion:auditRecordSchemaVersion })
})

test('audit events are immutable and duplicate handling is deterministic', async () => {
  const store = new InMemoryExecutionRecordStore()
  await store.createExecution(rec())
  await store.appendAuditEvent(event())
  await store.appendAuditEvent(event())
  await assert.rejects(() => store.appendAuditEvent({ ...event(), payload:{ different:true } }), /Duplicate eventId/)
})

test('restart reconciliation abandons non-terminal records without resuming sessions', async () => {
  const store = new InMemoryExecutionRecordStore()
  await store.createExecution(rec())
  await store.updateExecutionStatus('exec-1', { status:'started' })
  const changed = await store.reconcileAbandonedExecutions(new Set(), now)
  assert.deepEqual(changed, ['exec-1'])
  const detail = await store.getExecution('exec-1')
  assert.equal(detail?.execution.status, 'abandoned_after_restart')
  await assert.rejects(() => store.recordContinuation('exec-1', now), /Continuation requires paused|Invalid/)
})

test('pagination is bounded and responses contain no approval tokens or browser storage', async () => {
  const store = new InMemoryExecutionRecordStore()
  for (let i = 0; i < 105; i++) await store.createExecution(rec(`exec-${i}`))
  const listed = await store.listExecutions({ limit:500 })
  assert.equal(listed.items.length, 100)
  const json = JSON.stringify(listed)
  assert.equal(/approvalToken|cookies|localStorage|sessionStorage|Bearer/.test(json), false)
})
