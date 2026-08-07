// saas/lib/supervisor/orchestrator.ts
import { incidentSchema, isPlainSerializable, type SerializableValue, type SupervisorIncident } from './incident-schema.ts'
import { repairPlanSchema, type RepairPlan } from './repair-plan-schema.ts'
import type { AuditEvent, AuditSink, ExecutionContext, ExecutionResult, Executor, PolicyContext, PolicyDecision, PolicyEngine, SupervisorMode, Thinker, VerificationResult, Verifier } from './execution-contracts.ts'
import type { ExecutorKind, SupervisorDispatcher } from './executors/index.ts'
import type { RollbackCoordinator, RollbackOutcome } from './executors/rollback-coordinator.ts'
import type { StateSnapshotPort, StateSnapshotRef, TransactionBoundaryPlan } from './executors/state-snapshot-port.ts'
import { planTransactionBoundary } from './executors/state-snapshot-port.ts'
import type { EnvelopeInvocation, RepairClass } from '../portable/repair-envelope.ts'
import { evaluateRepairEnvelope } from '../portable/repair-envelope.ts'

export type SupervisorOrchestrationResult =
  | { status: 'blocked'; policy?: PolicyDecision; boundary?: TransactionBoundaryPlan; reason: string }
  | { status: 'approval_required'; policy: PolicyDecision; reason: string }
  // 'rolled_back' is its own status and not a flavour of 'completed'. The incident was
  // NOT repaired; the system was returned to where it started. A dashboard that counts a
  // rollback as a success stops showing anyone that repairs are failing.
  | { status: 'completed' | 'unresolved' | 'failed' | 'rolled_back'; policy?: PolicyDecision; execution?: ExecutionResult; verification?: VerificationResult; rollback?: RollbackOutcome; boundary?: TransactionBoundaryPlan; reason: string }

export interface SupervisorOrchestratorDeps { thinker: Thinker; policyEngine: PolicyEngine; executor: Executor; verifier: Verifier; audit: AuditSink; mode: SupervisorMode; policyContext?: PolicyContext; executionContext: ExecutionContext; dispatcher?: SupervisorDispatcher; requestedExecutorKind?: ExecutorKind | ((input: { plan: RepairPlan; policy: PolicyDecision }) => ExecutorKind); dispatchIdFactory?: (input: { incident: SupervisorIncident; plan: RepairPlan; policy: PolicyDecision }) => string;
  /**
   * OPTIONAL BY DESIGN. Without it the orchestrator behaves exactly as before: a failed
   * verification returns unresolved and a person picks it up. Supplying it closes the
   * loop — the plan's own undo steps run, under the coordinator's own refusals. Made
   * optional rather than required so that adding rollback cannot change the behaviour of
   * any deployment that has not opted in.
   */
  rollbackCoordinator?: RollbackCoordinator;
  /** The buyer's checkpoint mechanism. Supplying it turns each repair into a transaction. */
  snapshotPort?: StateSnapshotPort;
  /**
   * When true, a plan the boundary planner classifies UNBOUNDED is blocked before it runs
   * rather than executed and hoped over. This is the setting an enterprise turns on: it
   * converts "we will try to undo it" into "we do not start what we cannot finish".
   * Default false so enabling snapshots never silently changes existing behaviour.
   */
  requireBoundedExecution?: boolean;
  /**
   * Repair classes the buyer has pre-authorised. Absent or empty means every plan waits
   * for a person exactly as before — the envelope can only REMOVE a human from repairs
   * already permitted by policy, never add authority.
   */
  repairClasses?: readonly RepairClass[];
  /** Prior admissions, so a class's budget can be counted. Read from the caller's ledger. */
  recentEnvelopeInvocations?: readonly EnvelopeInvocation[] }

const schemaVersion = 'supervisor-audit-v1'
let eventCounter = 0
function eventId(): string { eventCounter += 1; return `audit-${Date.now()}-${eventCounter}` }
function sanitize(payload: Record<string, SerializableValue>): Record<string, SerializableValue> {
  if (!isPlainSerializable(payload)) return { summary: 'non-serializable payload omitted' }
  return payload
}

export class SupervisorOrchestrator {
  private readonly deps: SupervisorOrchestratorDeps

  constructor(deps: SupervisorOrchestratorDeps) {
    this.deps = deps
  }

  async run(rawIncident: unknown): Promise<SupervisorOrchestrationResult> {
    let incident: SupervisorIncident | undefined
    try {
      incident = incidentSchema.parse(rawIncident)
      await this.audit(incident, 'incident_received', { provider: incident.provider, environment: incident.environment })
      await this.audit(incident, 'thinker_started', {})
      const candidate = await this.deps.thinker.proposeRepairPlan(incident)
      let plan: RepairPlan
      try {
        plan = repairPlanSchema.parse(candidate)
      } catch (error) {
        await this.audit(incident, 'plan_rejected', { reason: 'invalid_thinker_output' })
        return { status: 'failed', reason: `Invalid Thinker output: ${error instanceof Error ? error.message : 'unknown error'}` }
      }
      await this.audit(incident, 'plan_generated', { planId: plan.planId, riskLevel: plan.riskLevel })
      if (plan.incidentId !== incident.incidentId) {
        await this.audit(incident, 'plan_rejected', { reason: 'incident_id_mismatch', planIncidentId: plan.incidentId })
        return { status: 'failed', reason: 'Repair plan incidentId does not match the incident.' }
      }
      // let, not const: the envelope may promote approval_required to approved below.
      let policy = await this.deps.policyEngine.evaluate({ incident, plan, mode: this.deps.mode, context: this.deps.policyContext ?? {} })
      await this.audit(incident, 'policy_evaluated', { outcome: policy.outcome, reason: policy.reason, approvedStepIds: policy.approvedStepIds })
      const stepIds = new Set(plan.steps.map(step => step.stepId))
      if (policy.approvedStepIds.some(stepId => !stepIds.has(stepId))) {
        await this.audit(incident, 'orchestration_failed', { reason: 'unknown_approved_step_id' })
        return { status: 'failed', policy, reason: 'Policy approved an unknown step ID.' }
      }
      if (policy.outcome === 'blocked') {
        await this.audit(incident, 'execution_blocked', { reason: policy.reason })
        return { status: 'blocked', policy, reason: policy.reason }
      }
      if (policy.outcome === 'approval_required') {
        // THE ENVELOPE IS CONSULTED ONLY HERE — at the moment a human would otherwise be
        // woken. It cannot reach a blocked plan, and when it refuses, the code below runs
        // unchanged, so a deployment with no classes configured behaves exactly as it did
        // before this existed.
        //
        // Reversibility is evaluated here before any human can be skipped. The same
        // boundary is recomputed again immediately before execution and the actual
        // checkpoint is captured there, before any dispatcher/executor call can mutate.
        const envelopeClasses = this.deps.repairClasses || []
        if (envelopeClasses.length && this.deps.snapshotPort) {
          const capabilities = await this.deps.snapshotPort.capabilities()
          const admission = evaluateRepairEnvelope({
            plan,
            policy,
            boundary: planTransactionBoundary(plan, capabilities),
            classes: envelopeClasses,
            recentInvocations: this.deps.recentEnvelopeInvocations,
          })
          await this.audit(incident, admission.admitted ? 'envelope_admitted' : 'envelope_refused', {
            classId: admission.classId ?? '',
            reasons: admission.reasons,
          })
          if (admission.admitted) {
            // Falls through to the normal approved path below. Nothing else changes: the
            // same step scope, the same checkpoint, the same verification and the same
            // rollback. The ONLY difference is that nobody was woken up to say yes.
            policy = { ...policy, outcome: 'approved', reason: `Pre-authorised: ${admission.reasons[0]}` }
          }
        }

        if (policy.outcome === 'approval_required') {
          await this.audit(incident, 'approval_required', { reason: policy.reason })
          return { status: 'approval_required', policy, reason: policy.reason }
        }
      }
      if (policy.approvedStepIds.length === 0) {
        await this.audit(incident, 'orchestration_failed', { reason: 'empty_approved_step_scope' })
        return { status: 'failed', policy, reason: 'Approved execution must include explicit step scope.' }
      }

      // ── TRANSACTIONAL BOUNDARY, ESTABLISHED BEFORE ANYTHING CHANGES ───────
      // This block MUST remain before execution_started and before every dispatcher/
      // executor call. A checkpoint captured after execution is the mutated state and
      // cannot satisfy the product's rollback guarantee.
      let boundary: TransactionBoundaryPlan | undefined
      const snapshots: StateSnapshotRef[] = []
      if (this.deps.snapshotPort) {
        const capabilities = await this.deps.snapshotPort.capabilities()
        boundary = planTransactionBoundary(plan, capabilities)
        await this.audit(incident, 'boundary_evaluated', { classification: boundary.classification, summary: boundary.summary, uncoveredScopes: boundary.uncoveredScopes })

        if (boundary.classification === 'unbounded' && this.deps.requireBoundedExecution) {
          return { status: 'blocked', policy, boundary, reason: `Execution blocked: ${boundary.summary}` }
        }

        for (const scope of boundary.scopesToCapture) {
          const captured = await this.deps.snapshotPort.capture({ scope, provider: plan.targetProvider, environment: plan.targetEnvironment, reason: `pre-repair checkpoint for ${plan.planId}` })
          if (!captured.ok || !captured.snapshot) {
            await this.audit(incident, 'snapshot_capture_failed', { scope, error: captured.error ?? 'unknown' })
            return { status: 'blocked', policy, boundary, reason: `Could not capture the ${scope} checkpoint before repairing, so the repair was not started: ${captured.error ?? 'no reason given'}` }
          }
          snapshots.push(captured.snapshot)
        }
        if (snapshots.length) await this.audit(incident, 'snapshot_captured', { snapshotIds: snapshots.map(item => item.snapshotId), scopes: snapshots.map(item => item.scope) })
      }

      await this.audit(incident, 'execution_started', { approvedStepIds: policy.approvedStepIds })
      let execution: ExecutionResult
      if (this.deps.dispatcher) {
        const requestedExecutorKind = typeof this.deps.requestedExecutorKind === 'function' ? this.deps.requestedExecutorKind({ plan, policy }) : (this.deps.requestedExecutorKind ?? 'api')
        const dispatchResult = await this.deps.dispatcher.dispatch({
          incident,
          plan,
          policyDecision: policy,
          approvedStepIds: [...policy.approvedStepIds],
          executionContext: this.deps.executionContext,
          dispatchId: this.deps.dispatchIdFactory?.({ incident, plan, policy }) ?? `${this.deps.executionContext.executionId}:${plan.planId}`,
          requestedExecutorKind,
        })
        execution = {
          status: dispatchResult.status === 'completed' ? 'completed' : 'failed',
          executedStepIds: dispatchResult.executedStepIds,
          startedAt: dispatchResult.startedAt,
          finishedAt: dispatchResult.completedAt,
          summary: dispatchResult.evidence.map(item => item.summary).join(' '),
          metadata: { dispatchId: dispatchResult.dispatchId, executorKind: dispatchResult.executorKind, dispatcherStatus: dispatchResult.status },
        }
      } else {
        execution = await this.deps.executor.execute({ incident, plan, policy, approvedStepIds: [...policy.approvedStepIds], context: this.deps.executionContext })
      }

      const approved = new Set(policy.approvedStepIds)
      if (execution.executedStepIds.some(stepId => !approved.has(stepId))) throw new Error('Executor reported steps outside approved scope')
      await this.audit(incident, 'execution_completed', { status: execution.status, executedStepIds: execution.executedStepIds })
      await this.audit(incident, 'verification_started', {})
      const verification = await this.deps.verifier.verify({ incident, plan, execution })
      await this.audit(incident, 'verification_completed', { status: verification.status, summary: verification.summary })
      if (execution.status !== 'completed' || verification.status !== 'verified') {
        // THE LOOP CLOSES HERE. The repair ran and the system is still not right, which
        // is the moment the plan's undo steps exist for. The coordinator decides whether
        // undoing is safe; this function only decides to ask. Everything it does is
        // audited, including a refusal, because "we chose not to undo" is a fact an
        // incident review will want as much as "we undid it".
        if (this.deps.rollbackCoordinator) {
          await this.audit(incident, 'rollback_started', { verificationStatus: verification.status })
          const rollback: RollbackOutcome = await this.deps.rollbackCoordinator.rollback({
            incident, plan, execution, verification, snapshots,
            dispatchId: typeof execution.metadata?.dispatchId === 'string' ? execution.metadata.dispatchId : undefined,
          })
          await this.audit(incident, 'rollback_completed', {
            status: rollback.status,
            reason: rollback.reason,
            executedStepIds: rollback.executedStepIds,
            reverification: rollback.reverification,
            handoffCode: rollback.handoff?.code ?? '',
          })
          // 'restored' is NOT 'completed'. The incident was not repaired — the system was
          // put back. Reporting a rollback as a successful repair would hide the failure
          // that caused it from every dashboard downstream.
          if (rollback.status === 'restored') {
            return { status: 'rolled_back', policy, execution, verification, rollback, boundary, reason: rollback.reason }
          }
          return { status: 'unresolved', policy, execution, verification, rollback, boundary, reason: rollback.reason }
        }
        return { status: 'unresolved', policy, execution, verification, reason: 'Execution or verification did not complete successfully.' }
      }
      return { status: 'completed', policy, execution, verification, reason: 'Repair execution verified.' }
    } catch (error) {
      if (incident) {
        try { await this.audit(incident, 'orchestration_failed', { reason: error instanceof Error ? error.message : 'unknown failure' }) } catch {}
      }
      return { status: 'failed', reason: error instanceof Error ? error.message : 'Supervisor orchestration failed closed.' }
    }
  }

  private async audit(incident: SupervisorIncident, eventType: AuditEvent['eventType'], payload: Record<string, SerializableValue>): Promise<void> {
    await this.deps.audit.write(Object.freeze({ eventId: eventId(), incidentId: incident.incidentId, eventType, occurredAt: new Date().toISOString(), payload: sanitize(payload), schemaVersion }))
  }
}
