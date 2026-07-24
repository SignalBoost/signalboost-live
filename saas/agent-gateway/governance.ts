// saas/agent-gateway/governance.ts
//
// THE STABLE CORE. The one part that is yours and never changes — it names no protocol and
// no vendor, and every request from every adapter passes through it. Two gates enforce the
// safety envelope:
//
//   Gate 1 — the categorical harm interlock. If the action's consequence class can affect
//            money, safety, data, or the outside world (or can't be classified), it ALWAYS
//            halts for a human. A class check, not a risk score: no confidence lets the
//            machine act here, and the allowlist cannot override it.
//   Gate 2 — the closed allowlist. Only a 'reversible_internal' action that is explicitly
//            listed AND carries a verified rollback runs unattended.
//   Default — halt. Anything unlisted or unclassifiable waits for a human.
//
// Every decision is audited to the buyer's SIEM.

import type {
  AgentRequest,
  ConsequenceClass,
  GatewayHost,
  GatewayOutcome,
  GovernanceDecision,
  GovernancePolicy,
  PortableAuditEvent,
} from './types.ts'
import { HUMAN_ONLY_CLASSES } from './types.ts'

const DATASET = 'agent_gateway'

function classifyFailClosed(request: AgentRequest, policy: GovernancePolicy): ConsequenceClass {
  try {
    return policy.classifier.classify(request) ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Pure decision: no side effects. Given a normalized request + policy, return the verdict. */
export function evaluate(request: AgentRequest, policy: GovernancePolicy): GovernanceDecision {
  const consequenceClass = classifyFailClosed(request, policy)

  // Gate 1 — categorical: money / safety / data / external / unknown are ALWAYS human-gated.
  if (HUMAN_ONLY_CLASSES.includes(consequenceClass)) {
    return {
      requestId: request.requestId,
      verdict: 'halt_for_approval',
      consequenceClass,
      reason: `consequence class '${consequenceClass}' always requires human approval`,
    }
  }

  // Gate 2 — closed allowlist: a reversible_internal action, explicitly listed, with a rollback.
  const entry = policy.allowlist.find(
    (e) => e.actionKind === request.action.kind && e.target === request.action.target,
  )
  if (consequenceClass === 'reversible_internal' && entry && entry.rollback) {
    return {
      requestId: request.requestId,
      verdict: 'execute',
      consequenceClass,
      reason: `pre-authorized reversible action (rollback: ${entry.rollback})`,
    }
  }

  // Default — halt.
  return {
    requestId: request.requestId,
    verdict: 'halt_for_approval',
    consequenceClass,
    reason: 'action is not in the pre-authorized allowlist',
  }
}

const SEVERITY = {
  'agent.executed': 'notice',
  'agent.execution_failed': 'high',
  'agent.halted_for_approval': 'warning',
  'agent.denied': 'high',
} as const

function auditEvent(
  request: AgentRequest,
  eventType: keyof typeof SEVERITY,
  decision: GovernanceDecision,
  extra?: Record<string, unknown>,
): PortableAuditEvent {
  return {
    eventId: `agw_${request.requestId}_${eventType}`,
    eventType,
    occurredAt: new Date().toISOString(),
    dataset: DATASET,
    category: 'process',
    subjectId: request.requestId,
    payload: {
      protocol: request.protocol,
      agentId: request.agentId,
      actionKind: request.action.kind,
      target: request.action.target,
      consequenceClass: decision.consequenceClass,
      verdict: decision.verdict,
      reason: decision.reason,
      ...(request.actor?.userId ? { userId: request.actor.userId } : {}),
      ...(extra ?? {}),
    },
  }
}

/**
 * The full governed run: decide, then act, halt, or deny — auditing every outcome to the
 * buyer's SIEM. Execution only ever happens on a Gate-2 'execute' verdict; everything else
 * is parked for a human via the buyer's approval port.
 */
export async function runGoverned(
  request: AgentRequest,
  policy: GovernancePolicy,
  host: GatewayHost,
): Promise<GatewayOutcome> {
  const decision = evaluate(request, policy)
  const base = {
    requestId: request.requestId,
    verdict: decision.verdict,
    consequenceClass: decision.consequenceClass,
    reason: decision.reason,
  }

  if (decision.verdict === 'execute') {
    const r = await host.execution.perform(request)
    const eventType = r.ok ? 'agent.executed' : 'agent.execution_failed'
    await host.audit?.record(auditEvent(request, eventType, decision, r.ok ? undefined : { error: r.error }))
    return { ...base, ok: r.ok, result: r.result, error: r.error }
  }

  if (decision.verdict === 'halt_for_approval') {
    let approvalId: string | undefined
    if (host.approvals) approvalId = (await host.approvals.requestApproval(request, decision)).approvalId
    await host.audit?.record(auditEvent(request, 'agent.halted_for_approval', decision, approvalId ? { approvalId } : undefined))
    return { ...base, ok: false, approvalId }
  }

  await host.audit?.record(auditEvent(request, 'agent.denied', decision))
  return { ...base, ok: false }
}
