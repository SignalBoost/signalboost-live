// saas/lib/supervisor/execution-contracts.ts
import type { SupervisorIncident, SerializableValue } from './incident-schema.ts'
import type { RepairPlan } from './repair-plan-schema.ts'

export type SupervisorMode = 'disabled' | 'passive' | 'autopilot'
export type PolicyOutcome = 'blocked' | 'approval_required' | 'approved'

export interface ProviderObservationContext { provider: string; environment: string; metadata?: Record<string, SerializableValue> }
export interface PolicyContext { policyVersion?: string; reversibleStepIds?: string[]; readOnlyStepIds?: string[]; metadata?: Record<string, SerializableValue> }
export interface ExecutionContext { executionId: string; requestedBy?: string; metadata?: Record<string, SerializableValue> }

export interface PolicyDecision { outcome: PolicyOutcome; reason: string; evaluatedAt: string; policyVersion: string; approvedStepIds: string[] }
export interface ExecutionResult { status: 'completed' | 'failed' | 'partial'; executedStepIds: string[]; startedAt: string; finishedAt: string; summary: string; metadata?: Record<string, SerializableValue> }
export interface VerificationResult { status: 'verified' | 'failed' | 'unresolved'; verifiedAt: string; summary: string; errors: string[]; metadata?: Record<string, SerializableValue> }
export interface ApprovalGateDecision { satisfied: boolean; reason: string; requestId?: string; approverIds?: string[] }

export type AuditEventType = 'incident_received' | 'thinker_started' | 'plan_generated' | 'plan_rejected' | 'policy_evaluated' | 'execution_blocked' | 'approval_required' | 'execution_started' | 'execution_completed' | 'verification_started' | 'verification_completed' | 'envelope_admitted' | 'envelope_refused' | 'boundary_evaluated' | 'snapshot_captured' | 'snapshot_capture_failed' | 'rollback_started' | 'rollback_completed' | 'orchestration_failed'
export interface AuditEvent { eventId: string; incidentId: string; eventType: AuditEventType; occurredAt: string; payload: Record<string, SerializableValue>; schemaVersion: string }

export interface Observer { observe(context: ProviderObservationContext): Promise<SupervisorIncident[]> | SupervisorIncident[] }
export interface Thinker { proposeRepairPlan(incident: SupervisorIncident): Promise<unknown> | unknown }
export interface PolicyEngine { evaluate(input: { incident: SupervisorIncident; plan: RepairPlan; mode: SupervisorMode; context: PolicyContext }): Promise<PolicyDecision> | PolicyDecision }
export interface ApprovalGate { evaluate(input: { incident: SupervisorIncident; plan: RepairPlan; policy: PolicyDecision }): Promise<ApprovalGateDecision> | ApprovalGateDecision }
export interface Executor { execute(input: { incident: SupervisorIncident; plan: RepairPlan; policy: PolicyDecision; approvedStepIds: string[]; context: ExecutionContext }): Promise<ExecutionResult> | ExecutionResult }
export interface Verifier { verify(input: { incident: SupervisorIncident; plan: RepairPlan; execution: ExecutionResult }): Promise<VerificationResult> | VerificationResult }
export interface AuditSink { write(event: Readonly<AuditEvent>): Promise<void> | void }
