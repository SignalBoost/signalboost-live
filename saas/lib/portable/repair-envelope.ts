// saas/lib/portable/repair-envelope.ts
//
// PRE-AUTHORISED REPAIR CLASSES — the last thing between a supervised system and one that
// does not call home on every fault.
//
// Until now every incident's plan waited for a person, even when the repair was "restart
// the stuck worker" for the ninetieth time. That is not caution, it is a pager rota with
// extra steps. Spacecraft do not radio for permission to switch to a redundant unit: the
// recovery was authorised ONCE, in advance, as a class of action inside a defined
// envelope. Anything outside the envelope halts and waits for ground command.
//
// This module is that envelope. The buyer declares classes of repair that may run
// unattended; every plan is tested against them before execution; and a plan that fails
// any test simply follows the old path and waits for a human. Nothing here can make the
// system do MORE than the policy engine already allowed — it can only remove the human
// from repairs the buyer has already decided are routine.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS COULD NOT HONESTLY BE BUILT BEFORE TODAY
//
// A pre-authorisation is a promise that if the repair goes wrong, going back is possible.
// Until the transactional boundary existed there was no way to CHECK that promise — the
// system could not tell whether a repair was reversible until it had already failed. Now
// planTransactionBoundary answers it before execution, so the envelope has a real
// admission test rather than a hopeful one:
//
//   A CLASS MAY RUN PRE-AUTHORISED ONLY IF THE PLAN IS BOUNDED.
//
// No checkpoint, no pre-authorisation. That single rule is what makes the rest defensible
// to a risk committee, and it must never be relaxed into "usually reversible".
//
// ─────────────────────────────────────────────────────────────────────────────
// THE LOOP PROBLEM, WHICH IS THE REAL DANGER HERE
//
// The failure mode of unattended repair is not one bad action — it is the same reasonable
// action forever. "Restart the deployment" pre-authorised, against a deployment that
// crashes on boot, is a restart storm that no single execution of it would look wrong.
// Every class therefore carries a BUDGET: how many times it may fire in a window. When the
// budget is spent the class stops admitting and a person is called, which is exactly the
// moment a person should be called — not because one repair failed, but because the same
// repair keeps being needed.

import type { RepairPlan, RepairStep } from '../supervisor/repair-plan-schema.ts'
import type { PolicyDecision } from '../supervisor/execution-contracts.ts'
import type { TransactionBoundaryPlan } from './state-snapshot-port.ts'

export const repairEnvelopeSchemaVersion = 'supervisor-repair-envelope-v1'

/** Hard ceilings the buyer cannot configure past. Policy is theirs; recklessness is not. */
export const ENVELOPE_MAX_STEPS_CEILING = 12
export const ENVELOPE_MAX_PER_WINDOW_CEILING = 20

export interface RepairClass {
  classId: string
  /** Plain language, shown in the audit record. Write it for the incident review. */
  description: string
  /** Providers this class covers — 'vercel', 'kubernetes'. Never a wildcard. */
  providers: readonly string[]
  /** Environments where it may run unattended. Listing 'production' is a real decision. */
  environments: readonly string[]
  /**
   * The capability action ids this class permits, exactly. Not patterns, not prefixes: a
   * pre-authorisation is a list of specific things, and a glob is how "restart a worker"
   * silently becomes "restart anything".
   */
  actionIds: readonly string[]
  maxSteps: number
  /** Budget — see the loop problem above. */
  maxPerWindow: number
  windowMinutes: number
  /**
   * Optional expiry. A standing authorisation that nobody revisits is how a decision made
   * for one incident becomes permanent policy by accident.
   */
  expiresAt?: string
}

export interface EnvelopeInvocation { classId: string; at: string }

export interface EnvelopeInput {
  plan: RepairPlan
  policy: PolicyDecision
  boundary?: TransactionBoundaryPlan
  classes: readonly RepairClass[]
  /** Prior admissions, so the budget can be counted. The caller reads these from its ledger. */
  recentInvocations?: readonly EnvelopeInvocation[]
  now?: Date
}

export interface EnvelopeDecision {
  admitted: boolean
  classId?: string
  /** Every reason, in the order tested. A refusal that says only "not admitted" is useless. */
  reasons: string[]
  schemaVersion: string
}

function actionIdOf(step: RepairStep): string {
  const declared = step.parameters?.actionId
  return typeof declared === 'string' && declared ? declared : String(step.action || '')
}

/** Steps that change nothing need no authorisation and must not consume the budget. */
function isMutating(step: RepairStep): boolean {
  return !['read', 'screenshot', 'verify', 'stop', 'request_approval'].includes(String(step.action))
}

export function evaluateRepairEnvelope(input: EnvelopeInput): EnvelopeDecision {
  const now = input.now ?? new Date()
  const reasons: string[] = []
  const refuse = (reason: string): EnvelopeDecision => ({ admitted: false, reasons: [...reasons, reason], schemaVersion: repairEnvelopeSchemaVersion })

  // ── 1. The envelope can never widen a policy decision ────────────────────
  // It removes a human from repairs the policy already permits. A blocked plan stays
  // blocked; if the policy engine says no, there is nothing here to appeal to.
  if (!input.policy || input.policy.outcome === 'blocked') {
    return refuse('The policy engine blocked this plan, and pre-authorisation cannot overrule it.')
  }

  const mutating = (input.plan.steps || []).filter(isMutating)
  if (!mutating.length) return refuse('The plan changes nothing, so there is nothing to pre-authorise.')

  // ── 2. THE BOUNDARY TEST — the rule the whole feature rests on ───────────
  if (!input.boundary) {
    return refuse('No transaction boundary was computed, so reversibility is unknown and the repair cannot run unattended.')
  }
  if (input.boundary.classification !== 'bounded') {
    return refuse(`The plan is ${input.boundary.classification.toUpperCase()}, not BOUNDED: ${input.boundary.summary} A repair runs pre-authorised only when a checkpoint can restore it.`)
  }

  // ── 3. Find the class that covers this plan ──────────────────────────────
  const candidates = (input.classes || []).filter(item =>
    item.providers.includes(input.plan.targetProvider) && item.environments.includes(input.plan.targetEnvironment))
  if (!candidates.length) {
    return refuse(`No repair class covers ${input.plan.targetProvider} in ${input.plan.targetEnvironment}.`)
  }

  const stepActions = mutating.map(actionIdOf)

  for (const repairClass of candidates) {
    const classReasons: string[] = []

    if (repairClass.expiresAt && Date.parse(repairClass.expiresAt) <= now.getTime()) {
      classReasons.push(`${repairClass.classId} expired at ${repairClass.expiresAt}.`)
    }

    const uncovered = stepActions.filter(action => !repairClass.actionIds.includes(action))
    if (uncovered.length) {
      classReasons.push(`${repairClass.classId} does not cover ${Array.from(new Set(uncovered)).join(', ')}.`)
    }

    const stepLimit = Math.min(repairClass.maxSteps, ENVELOPE_MAX_STEPS_CEILING)
    if (mutating.length > stepLimit) {
      classReasons.push(`${repairClass.classId} allows ${stepLimit} changing steps and this plan has ${mutating.length}.`)
    }

    // ── 4. The budget ──────────────────────────────────────────────────────
    const windowStart = now.getTime() - Math.max(1, repairClass.windowMinutes) * 60_000
    const used = (input.recentInvocations || []).filter(item =>
      item.classId === repairClass.classId && Date.parse(item.at) >= windowStart).length
    const budget = Math.min(repairClass.maxPerWindow, ENVELOPE_MAX_PER_WINDOW_CEILING)
    if (used >= budget) {
      // Worded for the person who reads it: the point is not that a repair failed, it is
      // that the SAME repair keeps being needed, which is a different problem.
      classReasons.push(`${repairClass.classId} has already run ${used} times in the last ${repairClass.windowMinutes} minutes, which is its limit. The same repair recurring is a condition for a person to look at, not to repeat.`)
    }

    if (!classReasons.length) {
      return {
        admitted: true,
        classId: repairClass.classId,
        reasons: [`Pre-authorised under ${repairClass.classId} (${repairClass.description}). Plan is BOUNDED, ${mutating.length} changing step(s), ${used} of ${budget} used in the last ${repairClass.windowMinutes} minutes.`],
        schemaVersion: repairEnvelopeSchemaVersion,
      }
    }
    reasons.push(...classReasons)
  }

  // The specific reasons are collected above; the summary must carry them. A refusal whose
  // last line is "no class admitted this plan" forces whoever reads it to go hunting for
  // the cause, and a message without a cause is how a diagnosable problem becomes a
  // guessing game.
  return refuse(reasons.length ? `No repair class admitted this plan: ${reasons.join(' ')}` : 'No repair class admitted this plan.')
}

/**
 * Validates classes at CONFIGURATION time, so a malformed envelope fails when the platform
 * starts rather than during the incident it was meant to handle. Throws — this is startup
 * code, and a silently-ignored bad class is an envelope nobody knows is empty.
 */
export function validateRepairClasses(classes: readonly RepairClass[]): void {
  const seen = new Set<string>()
  for (const item of classes) {
    if (!item.classId?.trim()) throw new Error('A repair class needs a classId.')
    if (seen.has(item.classId)) throw new Error(`Duplicate repair class ${item.classId}.`)
    seen.add(item.classId)
    if (!item.description?.trim()) throw new Error(`${item.classId} needs a description — it is what an incident review reads.`)
    if (!item.providers?.length) throw new Error(`${item.classId} must name at least one provider.`)
    if (!item.environments?.length) throw new Error(`${item.classId} must name at least one environment.`)
    if (!item.actionIds?.length) throw new Error(`${item.classId} must list the action ids it covers. An empty list would admit nothing; a wildcard is not supported on purpose.`)
    if (item.providers.includes('*') || item.environments.includes('*') || item.actionIds.includes('*')) {
      throw new Error(`${item.classId} uses a wildcard. Pre-authorisation is a list of specific things a buyer chose; a glob is how "restart a worker" becomes "restart anything".`)
    }
    if (!(item.maxSteps > 0)) throw new Error(`${item.classId} needs a positive maxSteps.`)
    if (!(item.maxPerWindow > 0) || !(item.windowMinutes > 0)) throw new Error(`${item.classId} needs a positive budget (maxPerWindow and windowMinutes) — an unbudgeted class is a restart storm waiting for the right outage.`)
  }
}
