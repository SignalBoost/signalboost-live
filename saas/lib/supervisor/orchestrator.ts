import { incidentSchema, isPlainSerializable, type SerializableValue, type SupervisorIncident } from './incident-schema.ts'
import { repairPlanSchema, type RepairPlan } from './repair-plan-schema.ts'
import type { AuditEvent, AuditSink, ExecutionContext, ExecutionResult, Executor, PolicyContext, PolicyDecision, PolicyEngine, SupervisorMode, Thinker, VerificationResult, Verifier } from './execution-contracts.ts'

export type SupervisorOrchestrationResult =
  | { status: 'blocked'; policy?: PolicyDecision; reason: string }
  | { status: 'approval_required'; policy: PolicyDecision; reason: string }
  | { status: 'completed' | 'unresolved' | 'failed'; policy?: PolicyDecision; execution?: ExecutionResult; verification?: VerificationResult; reason: string }

export interface SupervisorOrchestratorDeps { thinker: Thinker; policyEngine: PolicyEngine; executor: Executor; verifier: Verifier; audit: AuditSink; mode: SupervisorMode; policyContext?: PolicyContext; executionContext: ExecutionContext }

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
      const policy = await this.deps.policyEngine.evaluate({ incident, plan, mode: this.deps.mode, context: this.deps.policyContext ?? {} })
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
        await this.audit(incident, 'approval_required', { reason: policy.reason })
        return { status: 'approval_required', policy, reason: policy.reason }
      }
      if (policy.approvedStepIds.length === 0) {
        await this.audit(incident, 'orchestration_failed', { reason: 'empty_approved_step_scope' })
        return { status: 'failed', policy, reason: 'Approved execution must include explicit step scope.' }
      }
      await this.audit(incident, 'execution_started', { approvedStepIds: policy.approvedStepIds })
      const execution = await this.deps.executor.execute({ incident, plan, policy, approvedStepIds: [...policy.approvedStepIds], context: this.deps.executionContext })
      const approved = new Set(policy.approvedStepIds)
      if (execution.executedStepIds.some(stepId => !approved.has(stepId))) throw new Error('Executor reported steps outside approved scope')
      await this.audit(incident, 'execution_completed', { status: execution.status, executedStepIds: execution.executedStepIds })
      await this.audit(incident, 'verification_started', {})
      const verification = await this.deps.verifier.verify({ incident, plan, execution })
      await this.audit(incident, 'verification_completed', { status: verification.status, summary: verification.summary })
      if (execution.status !== 'completed' || verification.status !== 'verified') return { status: 'unresolved', policy, execution, verification, reason: 'Execution or verification did not complete successfully.' }
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
