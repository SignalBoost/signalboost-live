import type { PolicyContext, PolicyDecision, PolicyEngine, SupervisorMode } from '../execution-contracts.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import type { RepairPlan } from '../repair-plan-schema.ts'
import type { QuorumApprovalGate } from './quorum-gate.ts'

export class QuorumAwarePolicyEngine implements PolicyEngine {
  constructor(private readonly base: PolicyEngine, private readonly quorum: QuorumApprovalGate) {}

  async evaluate(input: { incident: SupervisorIncident; plan: RepairPlan; mode: SupervisorMode; context: PolicyContext }): Promise<PolicyDecision> {
    const decision = await this.base.evaluate(input)
    if (decision.outcome !== 'approval_required') return decision

    const scopedDecision: PolicyDecision = {
      ...decision,
      approvedStepIds: decision.approvedStepIds.length > 0
        ? [...decision.approvedStepIds]
        : input.plan.steps.map(step => step.stepId),
    }

    const quorum = await this.quorum.evaluate({ incident: input.incident, plan: input.plan, policy: scopedDecision })
    if (!quorum.satisfied) {
      return {
        ...decision,
        reason: `${decision.reason} ${quorum.reason}${quorum.requestId ? ` Request: ${quorum.requestId}.` : ''}`,
      }
    }

    return {
      ...scopedDecision,
      outcome: 'approved',
      reason: `${decision.reason} Quorum approval satisfied by ${quorum.approverIds?.length ?? 0} authorized approver(s).`,
    }
  }
}
