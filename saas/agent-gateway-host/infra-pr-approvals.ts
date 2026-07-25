// saas/agent-gateway-host/infra-pr-approvals.ts
//
// APPROVAL PORT — where a governance halt stops being an abstraction and becomes something
// with the owner's name on it.
//
// When the gateway halts an action, this adapter stages it as an Infrastructure PR: the PR
// opens, nothing executes, the owner reviews it in the cockpit, and only an explicit
// approval there can move it forward. That is ONBOARD-full §12's infrastructure-PR doctrine
// unchanged — AI stages exact templateId + JSON payload steps, the PR stays open, the owner
// merges, only then do provider APIs run. The gateway simply becomes another thing that can
// open one.
//
// THIS IS HOST CODE, NOT PORTABLE CODE. It is SignalBoost's answer to "what happens after a
// halt". A buyer swaps it for their own ServiceNow / Jira / GitHub change-request adapter
// behind the identical ApprovalPort interface, and the governance core never notices.
//
// Dependencies are INJECTED rather than imported: the real infra-pr store reaches Supabase
// at module load, which would make this file untestable under `node --test` and would drag
// a datastore into a code path that does not need one. The wiring file supplies the real
// function; tests supply a fake.

import type {
  AgentRequest,
  ApprovalPort,
  ConsequenceClass,
  GovernanceDecision,
} from '../agent-gateway/index.ts'

/** Risk tiers as used by lib/infra-pr/types.ts. */
export type InfraPrRiskTier = 'low' | 'medium' | 'high'

/** The subset of InfraPrDraft this adapter stages. */
export interface StagedInfraPrDraft {
  title: string
  description: string
  service: string
  action: string
  payload: Record<string, unknown>
  risk: InfraPrRiskTier
  triggers_redeploy: boolean
  source: 'assistant' | 'manual'
  created_by: string | null
}

/** Mirrors createInfraPr's Result<InfraPr> shape without importing the store. */
export interface CreateInfraPrResult {
  ok: boolean
  data?: { id: string }
  error?: string
}

export type CreateInfraPrFn = (draft: StagedInfraPrDraft) => Promise<CreateInfraPrResult>

/**
 * Consequence class → risk tier.
 *
 * Note what is absent: there is no path to 'low'. An action only reaches this adapter
 * BECAUSE governance refused to let it run unattended, so calling any of it low-risk would
 * be a lie told to whoever is triaging the queue. Unclassifiable actions are treated as
 * high — not knowing what something does is a reason for more caution, not less.
 */
export function riskTierFor(consequenceClass: ConsequenceClass): InfraPrRiskTier {
  switch (consequenceClass) {
    case 'external_effect':
      return 'medium'
    case 'safety':
    case 'financial':
    case 'data_destructive':
    case 'unknown':
    default:
      return 'high'
  }
}

export interface InfraPrApprovalPortOptions {
  createInfraPr: CreateInfraPrFn
  /** Recorded as the PR's service. Defaults to 'agent-gateway'. */
  service?: string
  /** Recorded as created_by when the request carries no actor. */
  defaultActor?: string
}

/** Build the PR draft for a halted request. Exported so tests and the cockpit can inspect it. */
export function draftForHaltedAction(
  request: AgentRequest,
  decision: GovernanceDecision,
  service: string,
  defaultActor?: string,
): StagedInfraPrDraft {
  const who = `${request.protocol}:${request.agentId}`
  return {
    title: `Agent action awaiting approval — ${request.action.kind}:${request.action.target}`,
    description: [
      `Agent \`${who}\` requested \`${request.action.kind}:${request.action.target}\`.`,
      '',
      `Governance classified this action **${decision.consequenceClass}** and HALTED it.`,
      'It has NOT been performed and will not run unless this PR is approved.',
      '',
      `Reason: ${decision.reason}`,
      request.tenantId ? `Tenant: ${request.tenantId}` : '',
      `Gateway request id: ${request.requestId}`,
    ].filter(Boolean).join('\n'),
    service,
    action: `${request.action.kind}:${request.action.target}`,
    payload: {
      requestId: request.requestId,
      protocol: request.protocol,
      agentId: request.agentId,
      ...(request.tenantId ? { tenantId: request.tenantId } : {}),
      ...(request.actor ? { actor: request.actor } : {}),
      action: request.action,
      consequenceClass: decision.consequenceClass,
      verdict: decision.verdict,
      reason: decision.reason,
    },
    risk: riskTierFor(decision.consequenceClass),
    // Staging a proposal never redeploys anything; only an approved merge can.
    triggers_redeploy: false,
    source: 'assistant',
    created_by: request.actor?.userId ?? defaultActor ?? null,
  }
}

/**
 * Build an ApprovalPort that stages halted agent actions as open Infrastructure PRs.
 *
 * Returns the PR id as the approvalId, so the calling agent — over MCP, A2A, or any other
 * protocol — is told exactly which PR is holding its request. If staging fails, the
 * approvalId comes back empty: the action stays halted either way, and a failure here can
 * never turn into an execution.
 */
export function createInfraPrApprovalPort(options: InfraPrApprovalPortOptions): ApprovalPort {
  const service = options.service ?? 'agent-gateway'

  return {
    async requestApproval(request: AgentRequest, decision: GovernanceDecision): Promise<{ approvalId: string }> {
      const draft = draftForHaltedAction(request, decision, service, options.defaultActor)
      try {
        const result = await options.createInfraPr(draft)
        if (!result.ok || !result.data?.id) return { approvalId: '' }
        return { approvalId: result.data.id }
      } catch {
        // Never let a staging failure propagate as an exception into the governance core.
        return { approvalId: '' }
      }
    },
  }
}
