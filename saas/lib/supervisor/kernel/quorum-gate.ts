import type { ApprovalGate, ApprovalGateDecision, PolicyDecision } from '../execution-contracts.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import type { RepairPlan } from '../repair-plan-schema.ts'
import { QuorumApprovalEngine, quorumRequestId, type QuorumPolicy, type QuorumRole } from './quorum-approval.ts'

export type QuorumPolicyResolver = (input: { incident: SupervisorIncident; plan: RepairPlan; policy: PolicyDecision }) => QuorumPolicy
export type MinimumQuorumPolicy = (input: { incident: SupervisorIncident; plan: RepairPlan; policy: PolicyDecision }) => Pick<QuorumPolicy, 'requiredSignaturesCount' | 'requiredRoles'>

const allowedRoles = new Set<QuorumRole>(['ON_CALL_LEAD', 'SECURITY_OFFICER', 'INFRA_ARCHITECT', 'ADMIN'])

export function createEnterpriseQuorumPolicyResolver(options: { ttlMs?: number; minimumPolicy?: MinimumQuorumPolicy } = {}): QuorumPolicyResolver {
  const ttlMs = options.ttlMs ?? 60 * 60 * 1000
  const minimumPolicy = options.minimumPolicy ?? (() => ({ requiredSignaturesCount: 1, requiredRoles: ['ON_CALL_LEAD'] }))

  return input => {
    const minimum = minimumPolicy(input)
    const advisoryCount = input.plan.approvalRequirements?.requiredApprovalsCount ?? 0
    const advisoryRoles = input.plan.approvalRequirements?.requiredRoles ?? []
    const roles = [...new Set([...minimum.requiredRoles, ...advisoryRoles])]
    for (const role of roles) if (!allowedRoles.has(role as QuorumRole)) throw new Error(`Unsupported quorum role: ${role}`)
    const requiredRoles = roles as QuorumRole[]
    const requiredSignaturesCount = Math.max(1, minimum.requiredSignaturesCount, advisoryCount, requiredRoles.length)
    return { requiredSignaturesCount, requiredRoles, ttlMs }
  }
}

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
