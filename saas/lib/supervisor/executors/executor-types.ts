import type { ExecutionContext, PolicyDecision } from '../execution-contracts.ts'
import type { SerializableValue, SupervisorIncident } from '../incident-schema.ts'
import type { RepairPlan, RepairStep } from '../repair-plan-schema.ts'
import type { ExecutionDecision } from '../execution-policy/index.ts'
import type { ApprovalContinuationProof } from './approval-continuation.ts'

export const executorKinds = ['api', 'browser', 'manual'] as const
export type ExecutorKind = (typeof executorKinds)[number]
export type ExecutorStatus = 'not_implemented' | 'dry_run_ready' | 'paused_for_approval' | 'completed' | 'failed' | 'rejected' | 'verification_failed'
export const executorSchemaVersion = 'supervisor-executor-result-v1'
export const dispatcherAuditSchemaVersion = 'supervisor-dispatch-audit-v1'

export interface DispatchMetadata { dispatchId: string; requestedExecutorKind: ExecutorKind; requestedAt: string }
export interface SupervisorExecutorInput {
  incident: SupervisorIncident
  plan: RepairPlan
  approvedStepIds: string[]
  executionContext: ExecutionContext
  dispatch: DispatchMetadata
  approvalContinuation?: ApprovalContinuationProof
}
export interface ExecutorEvidence { evidenceId: string; type: string; summary: string; data?: Record<string, SerializableValue> }
export interface SupervisorExecutorResult { dispatchId: string; executorKind: ExecutorKind; status: ExecutorStatus; startedAt: string; completedAt: string; executedStepIds: string[]; skippedStepIds: string[]; evidence: ExecutorEvidence[]; error?: { code: string; message: string }; schemaVersion: string }
export interface SupervisorExecutor { readonly kind: ExecutorKind; execute(input: SupervisorExecutorInput): Promise<SupervisorExecutorResult> | SupervisorExecutorResult }

/** Minimal buyer-portable fencing surface. It deliberately avoids the host coordination barrel. */
export interface DispatchCoordinationStore {
  assertFence(workItemId: string, identity: {
    leaseId: string
    ownerInstanceId: string
    ownerRuntimeId: string
    fencingToken: number
  }): Promise<void> | void
}

export interface SupervisorDispatchRequest {
  incident: SupervisorIncident
  plan: RepairPlan
  policyDecision: PolicyDecision
  approvedStepIds: string[]
  executionContext: ExecutionContext
  dispatchId: string
  requestedExecutorKind: ExecutorKind | string
  approvalContinuation?: ApprovalContinuationProof
  executionDecision?: ExecutionDecision
  coordinationStore?: DispatchCoordinationStore
}
export type DispatchAuditEventType = 'dispatch_requested' | 'dispatch_rejected' | 'dispatch_started' | 'dispatch_completed' | 'dispatch_failed' | 'executor_missing' | 'duplicate_dispatch_rejected' | 'approval_continuation_accepted' | 'approval_continuation_rejected' | 'browser_adapter_started' | 'browser_package_created' | 'browser_package_rejected' | 'browser_dry_run_ready' | 'sandbox_execution_requested' | 'sandbox_package_promoted' | 'sandbox_execution_started' | 'sandbox_execution_paused' | 'sandbox_continuation_started' | 'sandbox_execution_completed' | 'sandbox_execution_failed' | 'sandbox_verification_failed' | 'dispatch_fenced'
export interface DispatchAuditEvent { eventId: string; incidentId: string; dispatchId: string; eventType: DispatchAuditEventType; occurredAt: string; payload: Record<string, SerializableValue>; schemaVersion: string }
export interface DispatchAuditSink { write(event: Readonly<DispatchAuditEvent>): Promise<void> | void }

export const apiCompatibleActions = new Set<RepairStep['action']>(['api_request', 'read', 'verify', 'stop', 'request_approval'])
export const browserCompatibleActions = new Set<RepairStep['action']>(['navigate', 'click', 'fill', 'select', 'read', 'screenshot', 'verify', 'request_approval', 'stop'])
export const manualCompatibleActions = new Set<RepairStep['action']>(['stop', 'request_approval', 'verify', 'read'])
export function isExecutorKind(value: unknown): value is ExecutorKind { return typeof value === 'string' && (executorKinds as readonly string[]).includes(value) }
