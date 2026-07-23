import test from 'node:test'
import assert from 'node:assert/strict'
import { createAgentWorkflowAuditEvent, freezeWorkflowAuditEvents } from '../lib/agent-runtime/workflow-audit.ts'

const event = (action: any) => createAgentWorkflowAuditEvent({ eventId: 'audit-1', action, requestId: 'request-1', workflowId: 'workflow-1', userId: 'user-1', providerId: 'remote', language: 'typescript', attemptCount: 1, correctionCount: 0, quotaCostUnits: 1 }, () => 0)
test('creates bounded deterministic immutable workflow audit events without unsafe content', () => { const value = event('workflow_received'); assert.equal(value.timestamp, '1970-01-01T00:00:00.000Z'); assert.equal(Object.isFrozen(value), true); assert.doesNotMatch(JSON.stringify(value), /source|stdout|stderr|token|artifact/i); assert.throws(() => { (value as any).action = 'repair_failed' }); const events = freezeWorkflowAuditEvents([value]); assert.equal(Object.isFrozen(events), true); assert.throws(() => (events as any).push(value)) })
test('supports all bounded workflow audit actions', () => { for (const action of ['authorization_denied', 'quota_reserved', 'repair_started', 'repair_completed', 'repair_failed', 'quota_released', 'workflow_completed'] as const) assert.equal(event(action).action, action) })
