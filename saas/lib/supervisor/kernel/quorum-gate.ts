import type { ApprovalGate, ApprovalGateDecision, PolicyDecision } from '../execution-contracts.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import type { RepairPlan } from '../repair-plan-schema.ts'
import { QuorumApprovalEngine, quorumRequestId, type QuorumPolicy } from './quorum-approval.ts'

export type QuorumPolicyResolver = (input: { incident: SupervisorIncident; plan: RepairPlan; policy: PolicyDecision }) => QuorumPolicy

export class QuorumApprovalGate implements ApprovalGate {
  constructor(private readonly engine: QuorumApprovalEngine, private readonly resolvePolicy: QuorumPolicyResolver) {}

  async evaluate(input: { incident: SupervisorIncident; plan: RepairPlan; policy: PolicyDecision }): Promise<ApprovalGateDecision> {
    if (input.policy.outcome !== 'approval_required') {
      return { satisfied: false, reason: 'Quorum gate only evaluates approval_required policy decisions.' }
    }

    const state = await this.engine.ensureRequest({
      incident: input.incident,
      plan: input.plan,
      policy: input.policy,
      quorumPolicy: this.resolvePolicy(input),
    })

    if (!state.satisfied) {
      return {
        satisfied: false,
        requestId: state.request.requestId,
        approverIds: state.signatures.map(item => item.approverId),
        reason: `Quorum pending: ${state.signatures.length}/${state.request.quorumPolicy.requiredSignaturesCount} valid signatures collected.`,
      }
    }

    return {
      satisfied: true,
      requestId: quorumRequestId(input.plan, input.policy),
      approverIds: state.signatures.map(item => item.approverId),
      reason: 'Required quorum signatures and roles are satisfied for the exact plan and policy fingerprint.',
    }
  }
}
