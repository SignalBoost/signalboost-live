// saas/agent-gateway-host/pr-engine-approvals.ts
//
// The ApprovalPort that reaches the REAL cockpit.
//
// There are two infrastructure-PR systems in this repo and only one of them is visible to
// the owner: lib/hub/pr-engine.ts writes `infrastructure_prs`, which app/api/infra-pr/route.ts
// lists and merges. lib/infra-pr/store.ts writes `pending_infrastructure_prs`, which nothing
// in the cockpit reads. Staging a halted agent action into the second table would look like
// governance and function like a black hole, so this adapter targets pr-engine.
//
// THE CONSTRAINT THAT SHAPES EVERYTHING HERE: stageInfrastructurePR rejects any step whose
// templateId is not a registered provider template, and merging a PR executes each step by
// dispatching that templateId. System A is built for INFRASTRUCTURE TEMPLATE ACTIONS, not
// for arbitrary agent calls. A buyer's `wireTransfer` has no template and cannot be staged
// there — not a bug, a boundary.
//
// So approvals are TWO-TIER, and the tier is decided by whether the action has a template:
//   • MAPPED   → staged into the cockpit as a real PR. Approving it executes through the
//                existing merge machinery, unchanged. This is the path that actually works.
//   • UNMAPPED → handed to the fallback sink (the second table) so the halt is at least
//                durably recorded, and reported honestly as not-yet-visible.
// The fallback is a holding pen, not a feature. Every action that matters should earn a
// template mapping and graduate to tier one.

import type {
  AgentRequest,
  ApprovalPort,
  GovernanceDecision,
} from '../agent-gateway/index.ts'
import { riskTierFor } from './infra-pr-approvals.ts'
import type { InfraPrRiskTier } from './infra-pr-approvals.ts'

/** Mirrors lib/hub/pr-engine.ts's InfraPRStep without importing it. */
export interface PrEngineStep {
  provider: string
  templateId: string
  label: string
  payload: Record<string, unknown>
}

/** Mirrors stageInfrastructurePR's input and result. */
export interface StagePrInput {
  title: string
  summary?: string
  steps: PrEngineStep[]
  risk?: InfraPrRiskTier
  createdBy?: string | null
}
export interface StagePrResult {
  ok: boolean
  pr?: { id: string }
  error?: string
  duplicate?: boolean
}
export type StageInfrastructurePrFn = (input: StagePrInput) => Promise<StagePrResult>

/**
 * Maps one agent action onto a registered provider template, so an approved PR can actually
 * execute. Without this, the action has no way to run after approval.
 */
export interface ApprovableAction {
  actionKind: string
  target: string
  /** A REGISTERED provider template id, e.g. 'vercel.set_env'. Unregistered ids are rejected by pr-engine. */
  templateId: string
  /** Human one-liner shown in the cockpit. Defaults to the template id. */
  label?: string
  /** Parameter names allowed into the step payload. Everything else the agent sent is dropped. */
  allowedParams?: readonly string[]
}

export interface PrEngineApprovalPortOptions {
  stageInfrastructurePr: StageInfrastructurePrFn
  /** The closed set of actions that can become a cockpit PR. */
  actions: readonly ApprovableAction[]
  /**
   * Where halts with no template mapping go, so nothing is silently dropped. Typically the
   * createInfraPrApprovalPort adapter over lib/infra-pr/store. Omitting it means unmapped
   * halts are recorded nowhere — which the outcome will report as an empty approvalId.
   */
  fallback?: ApprovalPort
  defaultActor?: string
}

function pickParams(
  params: Record<string, unknown> | undefined,
  allowed: readonly string[] | undefined,
): Record<string, unknown> {
  if (!params) return {}
  if (!allowed) return { ...params }
  const out: Record<string, unknown> = {}
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(params, key)) out[key] = params[key]
  }
  return out
}

/**
 * The agent's own words, for the person reading the PR.
 *
 * These live in the SUMMARY rather than the step payload on purpose. pr-engine fingerprints
 * a PR by its steps — templateId plus canonical payload — so anything that varies between
 * runs produces a second PR for the same problem. Model prose varies every time. Keeping it
 * here means the reader still sees exactly what was proposed, while the payload stays stable
 * enough to deduplicate.
 */
function describedProposal(request: AgentRequest): string[] {
  const params = request.action.params ?? {}
  const described = typeof params.describedAction === 'string' ? params.describedAction.trim() : ''
  const target = typeof params.describedTarget === 'string' ? params.describedTarget.trim() : ''
  const expected = typeof params.expectedResult === 'string' ? params.expectedResult.trim() : ''
  const out: string[] = []
  if (described) out.push(`Proposed: ${described.slice(0, 400)}`)
  if (target) out.push(`Against: ${target.slice(0, 200)}`)
  if (expected) out.push(`Expected: ${expected.slice(0, 200)}`)
  return out
}

/** Build the cockpit PR for a halted, template-mapped action. Exported for inspection and tests. */
export function stagedPrFor(
  request: AgentRequest,
  decision: GovernanceDecision,
  action: ApprovableAction,
  defaultActor?: string,
): StagePrInput {
  const who = `${request.protocol}:${request.agentId}`
  return {
    title: `Agent action awaiting approval — ${request.action.kind}:${request.action.target}`,
    summary: [
      `Agent \`${who}\` requested \`${request.action.kind}:${request.action.target}\`.`,
      `Governance classified it ${decision.consequenceClass} and HALTED it.`,
      'It has NOT been performed. Approving this PR executes it; closing this PR leaves it undone.',
      `Reason: ${decision.reason}`,
      ...describedProposal(request),
      `Gateway request id: ${request.requestId}`,
    ].join(' '),
    steps: [{
      provider: action.templateId.split('.')[0],
      templateId: action.templateId,
      label: action.label ?? action.templateId,
      payload: pickParams(request.action.params, action.allowedParams),
    }],
    risk: riskTierFor(decision.consequenceClass),
    createdBy: request.actor?.userId ?? defaultActor ?? null,
  }
}

/**
 * Build an ApprovalPort that stages halted agent actions as OPEN cockpit PRs.
 *
 * Returns the PR id as the approvalId. On any failure — unmapped action with no fallback, a
 * staging error, a throwing store — the approvalId comes back empty. The action stays halted
 * in every case; a failure here can never become an execution.
 */
export function createPrEngineApprovalPort(options: PrEngineApprovalPortOptions): ApprovalPort {
  const map = new Map(options.actions.map((a) => [`${a.actionKind}\u0000${a.target}`, a]))

  return {
    async requestApproval(request: AgentRequest, decision: GovernanceDecision): Promise<{ approvalId: string }> {
      const action = map.get(`${request.action.kind}\u0000${request.action.target}`)

      // Tier 2: no template, so it cannot become an executable cockpit PR.
      if (!action) {
        if (!options.fallback) return { approvalId: '' }
        try {
          return await options.fallback.requestApproval(request, decision)
        } catch {
          return { approvalId: '' }
        }
      }

      // Tier 1: the real thing.
      try {
        const result = await options.stageInfrastructurePr(
          stagedPrFor(request, decision, action, options.defaultActor),
        )
        if (!result.ok || !result.pr?.id) return { approvalId: '' }
        return { approvalId: result.pr.id }
      } catch {
        return { approvalId: '' }
      }
    },
  }
}
