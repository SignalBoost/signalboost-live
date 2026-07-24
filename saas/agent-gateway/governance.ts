// saas/agent-gateway/governance.ts
//
// Protocol-agnostic governance core for the governed agent socket. It classifies every
// normalized request, permits unattended execution only for explicitly allowlisted and
// reversible internal actions, and otherwise fails closed behind human approval.

import {
  HUMAN_ONLY_CLASSES,
  type AgentRequest,
  type GatewayHost,
  type GatewayOutcome,
  type GovernanceDecision,
  type GovernancePolicy,
  type PortableAuditEvent,
} from './types.ts'

function isAllowlisted(request: AgentRequest, policy: GovernancePolicy): boolean {
  return policy.allowlist.some((entry) =>
    entry.actionKind === request.action.kind
    && entry.target === request.action.target
    && entry.rollback.trim().length > 0,
  )
}

export function evaluateGovernance(
  request: AgentRequest,
  policy: GovernancePolicy,
): GovernanceDecision {
  const consequenceClass = policy.classifier.classify(request)

  if (HUMAN_ONLY_CLASSES.includes(consequenceClass)) {
    return {
      requestId: request.requestId,
      verdict: 'halt_for_approval',
      consequenceClass,
      reason: `consequence class '${consequenceClass}' requires human approval`,
    }
  }

  if (consequenceClass !== 'reversible_internal') {
    return {
      requestId: request.requestId,
      verdict: 'deny',
      consequenceClass,
      reason: `unsupported consequence class '${consequenceClass}'`,
    }
  }

  if (!isAllowlisted(request, policy)) {
    return {
      requestId: request.requestId,
      verdict: 'halt_for_approval',
      consequenceClass,
      reason: 'reversible action is not present in the closed allowlist with a rollback',
    }
  }

  return {
    requestId: request.requestId,
    verdict: 'execute',
    consequenceClass,
    reason: 'reversible internal action is explicitly allowlisted with a rollback',
  }
}

function auditEvent(
  request: AgentRequest,
  decision: GovernanceDecision,
  outcome: Pick<GatewayOutcome, 'ok' | 'error' | 'approvalId'>,
  policy: GovernancePolicy,
): PortableAuditEvent {
  return {
    eventId: `agent-gateway:${request.requestId}:${decision.verdict}`,
    eventType: `agent_gateway.${decision.verdict}`,
    occurredAt: new Date().toISOString(),
    dataset: 'agent_gateway.governance',
    category: 'process',
    schemaVersion: 1,
    subjectId: request.requestId,
    correlationId: request.requestId,
    payload: {
      protocol: request.protocol,
      agentId: request.agentId,
      tenantId: request.tenantId ?? policy.tenantId,
      environment: policy.environment,
      actionKind: request.action.kind,
      actionTarget: request.action.target,
      consequenceClass: decision.consequenceClass,
      verdict: decision.verdict,
      reason: decision.reason,
      ok: outcome.ok,
      error: outcome.error,
      approvalId: outcome.approvalId,
    },
  }
}

async function recordAudit(
  host: GatewayHost,
  request: AgentRequest,
  decision: GovernanceDecision,
  outcome: Pick<GatewayOutcome, 'ok' | 'error' | 'approvalId'>,
  policy: GovernancePolicy,
): Promise<void> {
  if (!host.audit) return
  await host.audit.record(auditEvent(request, decision, outcome, policy))
}

export async function governAndExecute(
  request: AgentRequest,
  policy: GovernancePolicy,
  host: GatewayHost,
): Promise<GatewayOutcome> {
  const decision = evaluateGovernance(request, policy)

  if (decision.verdict === 'deny') {
    const outcome: GatewayOutcome = {
      ...decision,
      ok: false,
      error: decision.reason,
    }
    await recordAudit(host, request, decision, outcome, policy)
    return outcome
  }

  if (decision.verdict === 'halt_for_approval') {
    if (!host.approvals) {
      const outcome: GatewayOutcome = {
        ...decision,
        ok: false,
        error: 'human approval is required but no approval port is configured',
      }
      await recordAudit(host, request, decision, outcome, policy)
      return outcome
    }

    try {
      const approval = await host.approvals.requestApproval(request, decision)
      const outcome: GatewayOutcome = {
        ...decision,
        ok: false,
        approvalId: approval.approvalId,
      }
      await recordAudit(host, request, decision, outcome, policy)
      return outcome
    } catch (error) {
      const outcome: GatewayOutcome = {
        ...decision,
        ok: false,
        error: error instanceof Error ? error.message : 'approval request failed',
      }
      await recordAudit(host, request, decision, outcome, policy)
      return outcome
    }
  }

  try {
    const execution = await host.execution.perform(request)
    const outcome: GatewayOutcome = {
      ...decision,
      ok: execution.ok,
      result: execution.result,
      error: execution.error,
    }
    await recordAudit(host, request, decision, outcome, policy)
    return outcome
  } catch (error) {
    const outcome: GatewayOutcome = {
      ...decision,
      ok: false,
      error: error instanceof Error ? error.message : 'execution failed',
    }
    await recordAudit(host, request, decision, outcome, policy)
    return outcome
  }
}
