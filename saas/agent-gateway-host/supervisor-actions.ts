// saas/agent-gateway-host/supervisor-actions.ts
//
// WHERE A DIAGNOSED REPAIR GOES.
//
// supervisor-repair.ts runs each step of a diagnosed repair plan through the governed
// socket. Every step halts (nothing is allowlisted, and the classifier returns 'unknown'
// for a repair target), and a halt goes to the ApprovalPort. Until this module existed the
// halt had no template mapping, so it fell into the infra-pr holding pen — a table nothing
// reads. The repair was recorded and invisible, which is only marginally better than the
// old behavior of discarding it.
//
// This module supplies the mapping that lands the halt in the Infrastructure PR cockpit the
// owner already uses. Two decisions make that safe:
//
//   1. ONE STABLE, NON-EXECUTABLE TARGET. The resolver never turns model prose into an
//      action id. It maps every step onto the single constant PROPOSED_REPAIR_TARGET, which
//      appears in no allowlist and in no execution map, so it cannot execute — it exists
//      only to give the approval port a key it can match. Rule 3 of the bridge holds.
//   2. THE STAGED STEP IS READ-ONLY. The PR carries `vercel.view_env`, the one Vercel
//      template the hub action route actually implements and the same one the old
//      investigation used. Merging it lists environment variable NAMES and nothing else.
//      A template that the hub route does not implement would stage a PR that could only
//      die at merge, so nothing else is mapped here.
//
// So after this: the supervisor detects, diagnoses, and puts its ACTUAL proposed repair in
// front of the owner as a reviewable PR. What it still does not do is perform the repair —
// that needs an executable recovery action in the hub action route, which is a separate,
// deliberate step.

import type { ApprovableAction } from './pr-engine-approvals.ts'
import type { DispatchRepairPlanResult, RepairActionResolver } from './supervisor-repair.ts'
import { UNRECOGNIZED_TARGET } from './supervisor-repair.ts'

/**
 * The single target every proposed repair step is mapped onto. Deliberately not a verb and
 * deliberately not derived from the model's prose: it is a routing key, not an instruction.
 * It is absent from GATEWAY_ALLOWLIST and API_ACTIONS, so governance can only ever halt it.
 */
export const PROPOSED_REPAIR_TARGET = 'supervisor.proposed_repair'

/** The read-only provider template a proposed repair is staged against. */
export const REPAIR_REVIEW_TEMPLATE = 'vercel.view_env'

/**
 * The step parameters carried into the PR payload. These are the diagnosis's own words,
 * shown to the person reviewing the PR. No credential, no secret, no free-text target is
 * ever used as an execution parameter.
 */
export const REPAIR_REVIEW_PARAMS: readonly string[] = [
  'incidentId',
  'project',
  'stepNumber',
  'describedAction',
  'describedTarget',
  'expectedResult',
  'executor',
  'requiresApproval',
]

/**
 * The closed set of supervisor actions that can become a cockpit PR.
 *
 * Both entries stage the same read-only step. UNRECOGNIZED_TARGET is what the bridge emits
 * when the diagnosis marked a step as requiring approval or assigned it to a human — those
 * must still reach the owner, so they are mapped too.
 */
export const SUPERVISOR_REPAIR_ACTIONS: readonly ApprovableAction[] = Object.freeze([
  Object.freeze({
    actionKind: 'supervisor_repair',
    target: PROPOSED_REPAIR_TARGET,
    templateId: REPAIR_REVIEW_TEMPLATE,
    label: 'Supervisor proposed repair — review (read-only inspection)',
    allowedParams: REPAIR_REVIEW_PARAMS,
  }),
  Object.freeze({
    actionKind: 'supervisor_repair',
    target: UNRECOGNIZED_TARGET,
    templateId: REPAIR_REVIEW_TEMPLATE,
    label: 'Supervisor repair requiring a person — review (read-only inspection)',
    allowedParams: REPAIR_REVIEW_PARAMS,
  }),
]) as readonly ApprovableAction[]

/**
 * Maps every repair step onto PROPOSED_REPAIR_TARGET.
 *
 * This recognizes nothing as executable — it is not a step toward autonomy, it is a routing
 * decision. Replacing it with a resolver that returns real action ids is what would make
 * repairs executable, and that must not happen before those actions exist in the hub action
 * route and have earned an allowlist entry.
 */
export const resolveSupervisorRepairAction: RepairActionResolver = () => PROPOSED_REPAIR_TARGET

export interface RepairDispatchSummary {
  /** Steps the bridge attempted before stopping. */
  attempted: number
  /** Steps in the diagnosed plan. */
  planned: number
  /** Cockpit PR ids opened for the owner. Empty when staging was unavailable. */
  prIds: string[]
  /** 'staged' — the repair is in the cockpit. 'unavailable' — nothing could be staged. */
  mode: 'staged' | 'not_required' | 'unavailable'
  message: string
  /** Present when the run stopped before the last step, naming why. */
  stoppedAt?: { step: number; reason: string }
}

/**
 * Turn a bridge result into the small, honest summary the webhook returns.
 *
 * A halt is the expected outcome, not a failure: the run stops at the first step that did
 * not execute so a later step never runs against a half-repaired system.
 */
export function summarizeRepairDispatch(
  result: DispatchRepairPlanResult,
  planned: number,
): RepairDispatchSummary {
  const prIds = result.results
    .map((r) => r.outcome.approvalId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  if (planned === 0) {
    return {
      attempted: 0,
      planned: 0,
      prIds: [],
      mode: 'not_required',
      message: 'The validated diagnosis proposed no repair steps.',
    }
  }

  if (prIds.length === 0) {
    return {
      attempted: result.results.length,
      planned,
      prIds,
      mode: 'unavailable',
      message:
        'The repair plan was diagnosed but could not be staged for approval. Check that the Infrastructure PR cockpit is reachable.',
      ...(result.stoppedAt ? { stoppedAt: result.stoppedAt } : {}),
    }
  }

  return {
    attempted: result.results.length,
    planned,
    prIds,
    mode: 'staged',
    message:
      planned > result.results.length
        ? `Step 1 of ${planned} is awaiting approval in the Infrastructure PR cockpit. The remaining steps are held until it is approved.`
        : `The proposed repair is awaiting approval in the Infrastructure PR cockpit (${prIds.length} PR).`,
    ...(result.stoppedAt ? { stoppedAt: result.stoppedAt } : {}),
  }
}
