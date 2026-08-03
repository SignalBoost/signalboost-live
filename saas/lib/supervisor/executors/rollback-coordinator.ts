// saas/lib/supervisor/executors/rollback-coordinator.ts
//
// AUTOMATED ROLLBACK. Closes the self-healing loop: when a repair runs but the
// verification says the system is not better, the plan's own undo steps execute without
// waiting for a person. If the undo cannot be done safely, or does not work, a human is
// called — that handoff is the floor of this module, never a silent failure.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS ALLOWED TO ACT WITHOUT A NEW APPROVAL
//
// The rollback steps are not new work. They are part of the RepairPlan that was already
// authorised and fingerprinted, so approving a plan approved its undo at the same moment.
// This module never invents a step, never composes one, and never accepts a step from
// anywhere except `plan.rollbackSteps`. Anything outside that list does not exist to it.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FIVE REFUSALS, and the reasoning behind each. This is the part to read.
//
// 1. IT ONLY RUNS ON A FAILED VERIFICATION, NEVER AN UNRESOLVED ONE.
//    'failed' means the checks ran and the system is not in the expected state — undo is
//    the right response. 'unresolved' means the checks could not answer. Undoing a change
//    when you cannot see the current state is how a partial outage becomes a full one, so
//    an unresolved verification hands off to a person instead. Not knowing is not a reason
//    to act; it is the reason to stop.
//
// 2. MONEY AND CREDENTIALS ARE NEVER UNDONE AUTOMATICALLY.
//    A refund is not the inverse of a charge and a re-rotated key is not the old key —
//    "undoing" either creates a second real-world event rather than cancelling the first.
//    Any rollback step the danger policy classifies as financial or credential_security
//    hands off, regardless of how it is registered.
//
// 3. A ROLLBACK STEP MUST MATCH A CAPABILITY THE BUYER REGISTERED AS routine_reversible.
//    The registry already grades every capability read_only / routine_reversible /
//    consequential. Restarting a container or restoring the previous build is what
//    routine_reversible means, and that is exactly the shape of a good undo. A step that
//    matches nothing, or matches a consequential capability, hands off. The buyer decides
//    what may be undone unattended by how they populate their own registry — this module
//    holds no list of its own, because a vendor-side allowlist of "safe" commands would be
//    a guess about someone else's infrastructure.
//
// 4. IT STOPS AT THE FIRST ROLLBACK STEP THAT FAILS.
//    A failing undo means the system is not where the plan thought it was. Continuing to
//    apply later undo steps against an unknown state is the single most dangerous thing
//    this module could do, so it stops and hands off with everything it managed so far
//    recorded. Half an undo, honestly reported, beats a full undo applied blind.
//
// 5. IT RUNS ONCE PER DISPATCH.
//    The caller passes rollbackAlreadyAttempted. A retry loop that re-runs an undo is how
//    a restart becomes a restart storm. Second attempt is a human's decision, not a
//    scheduler's.
//
// AND ONE OBLIGATION: if a verifier is supplied, the rollback is itself VERIFIED. An undo
// that runs without being checked is a hope, not a repair. If the re-check does not come
// back verified, the outcome is a handoff even though every step reported success.

import type { SerializableValue, SupervisorIncident } from '../incident-schema.ts'
import type { RepairPlan, RepairStep } from '../repair-plan-schema.ts'
import type { ExecutionResult, VerificationResult, Verifier } from '../execution-contracts.ts'
import type { ApiCapabilityRegistry } from './api-capability-registry.ts'
import { emptyApiCapabilityRegistry } from './api-capability-registry.ts'
import { classifyStep, dangerCategoryOf } from './api-danger-policy.ts'

export const rollbackSchemaVersion = 'supervisor-rollback-result-v1'

/** Hard ceiling regardless of plan length. An undo longer than this is a migration. */
export const ROLLBACK_MAX_STEPS = 20
export const ROLLBACK_STEP_TIMEOUT_MS = 30_000

export type RollbackStatus =
  | 'not_attempted'   // nothing to undo, or the situation did not call for one
  | 'restored'        // every undo step ran and the re-check passed
  | 'handed_off'      // a person is needed, for one of the reasons above

export interface RollbackHandoff {
  code: string
  message: string
  /** Always true. This field exists so a caller cannot read a handoff as a soft warning. */
  humanActionRequired: true
}

export interface RollbackEvidence {
  stepId: string
  outcome: 'executed' | 'refused' | 'failed' | 'skipped'
  summary: string
  at: string
  data?: Record<string, SerializableValue>
}

export interface RollbackOutcome {
  planId: string
  incidentId: string
  dispatchId?: string
  status: RollbackStatus
  reason: string
  executedStepIds: string[]
  skippedStepIds: string[]
  evidence: RollbackEvidence[]
  reverification: 'verified' | 'failed' | 'unresolved' | 'not_run'
  handoff?: RollbackHandoff
  attemptedAt: string
  completedAt: string
  schemaVersion: string
}

/**
 * How one undo step is performed against the buyer's systems. Same shape as the repair
 * runner — a rollback is an ordinary API call, and giving it a privileged path of its
 * own would be a second execution route to audit.
 */
export interface RollbackStepRunner {
  (step: RepairStep, context: { incident: SupervisorIncident; plan: RepairPlan }): Promise<{ ok: boolean; summary: string; data?: Record<string, SerializableValue> }> | { ok: boolean; summary: string; data?: Record<string, SerializableValue> }
}

export interface RollbackCoordinatorOptions {
  runner: RollbackStepRunner
  registry?: ApiCapabilityRegistry
  /** Optional but strongly recommended: without it the undo is never checked. */
  verifier?: Verifier
  stepTimeoutMs?: number
  maxSteps?: number
  now?: () => Date
}

export interface RollbackInput {
  incident: SupervisorIncident
  plan: RepairPlan
  execution: ExecutionResult
  verification: VerificationResult
  dispatchId?: string
  /** True when an undo has already been attempted for this dispatch. See refusal 5. */
  rollbackAlreadyAttempted?: boolean
}

export interface RollbackCoordinator {
  rollback(input: RollbackInput): Promise<RollbackOutcome>
}

async function withTimeout<T>(run: () => Promise<T> | T, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(run),
      // A hung undo is worse than a failed one: it holds the incident open while the
      // system stays broken. It rejects so the caller treats it as a failure, never a pass.
      new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function createRollbackCoordinator(options: RollbackCoordinatorOptions): RollbackCoordinator {
  const registry = options.registry ?? emptyApiCapabilityRegistry
  const stepTimeoutMs = options.stepTimeoutMs ?? ROLLBACK_STEP_TIMEOUT_MS
  const maxSteps = Math.min(options.maxSteps ?? ROLLBACK_MAX_STEPS, ROLLBACK_MAX_STEPS)
  const now = options.now ?? (() => new Date())

  return {
    async rollback(input: RollbackInput): Promise<RollbackOutcome> {
      const attemptedAt = now().toISOString()
      const evidence: RollbackEvidence[] = []
      const executed: string[] = []
      const skipped: string[] = []

      const finish = (
        status: RollbackStatus,
        reason: string,
        reverification: RollbackOutcome['reverification'],
        handoff?: RollbackHandoff,
      ): RollbackOutcome => ({
        planId: input.plan?.planId ?? 'unknown',
        incidentId: input.incident?.incidentId ?? 'unknown',
        dispatchId: input.dispatchId,
        status,
        reason,
        executedStepIds: executed,
        skippedStepIds: skipped,
        evidence,
        reverification,
        ...(handoff ? { handoff } : {}),
        attemptedAt,
        completedAt: now().toISOString(),
        schemaVersion: rollbackSchemaVersion,
      })

      const handOff = (code: string, message: string, reverification: RollbackOutcome['reverification'] = 'not_run') =>
        finish('handed_off', message, reverification, { code, message, humanActionRequired: true })

      const note = (stepId: string, outcome: RollbackEvidence['outcome'], summary: string, data?: Record<string, SerializableValue>) => {
        evidence.push({ stepId, outcome, summary, at: now().toISOString(), ...(data ? { data } : {}) })
      }

      try {
        // ── Refusal 5 ────────────────────────────────────────────────────────
        if (input.rollbackAlreadyAttempted) {
          return handOff('rollback_already_attempted', 'An undo was already attempted for this dispatch. A second attempt is a human decision.')
        }

        // ── Refusal 1 ────────────────────────────────────────────────────────
        if (input.verification.status === 'verified') {
          return finish('not_attempted', 'Verification passed; there is nothing to undo.', 'not_run')
        }
        if (input.verification.status !== 'failed') {
          return handOff(
            'verification_unresolved',
            'Verification could not determine the system state, so the undo was not run. Undoing against an unknown state can widen an incident.',
          )
        }

        // Nothing was changed, so there is nothing to reverse. Reporting this as a
        // successful rollback would be a lie of convenience.
        if (!input.execution.executedStepIds?.length) {
          return finish('not_attempted', 'No repair steps executed, so nothing required reversing.', 'not_run')
        }

        const rollbackSteps = Array.isArray(input.plan.rollbackSteps) ? input.plan.rollbackSteps : []
        if (!rollbackSteps.length) {
          return handOff(
            'no_rollback_defined',
            'The repair did not verify and this plan defines no undo steps, so a person must decide how to restore the system.',
          )
        }
        if (rollbackSteps.length > maxSteps) {
          return handOff(
            'rollback_too_long',
            `This plan defines ${rollbackSteps.length} undo steps, above the ceiling of ${maxSteps}. An undo that long is a migration and needs a person.`,
          )
        }

        // ── Refusals 2 and 3, checked for EVERY step BEFORE any step runs ────
        // Deliberately a separate pass. Discovering on step four that step five was
        // never permitted would leave the system half-reversed, which is the worst of
        // both outcomes — so the whole undo is admissible or none of it runs.
        for (const step of rollbackSteps) {
          if (step.protectedAction) {
            note(step.stepId, 'refused', 'Step is marked as a protected action.')
            return handOff('rollback_step_protected', `Undo step ${step.stepId} is a protected action and needs a person to authorise it.`)
          }

          const verdict = classifyStep(step, input.plan.targetProvider, registry)
          const capability = verdict.capabilityMatch?.capability

          // dangerCategoryOf, NOT verdict.category. classifyStep only reports a category
          // when its verdict is dangerous, and a step matching a registered
          // routine_reversible capability is not dangerous by that measure — so reading
          // verdict.category here let a refund and a credential rotation through the veto
          // below. Registration answers who may run it; this answers what it is.
          const category = dangerCategoryOf(step, input.plan.targetProvider)

          if (category === 'financial' || category === 'credential_security') {
            note(step.stepId, 'refused', `Step is classified ${category}.`)
            return handOff(
              'rollback_step_irreversible_class',
              `Undo step ${step.stepId} touches ${category === 'financial' ? 'money' : 'credentials'}. Reversing that creates a second real event rather than cancelling the first, so a person decides.`,
            )
          }

          if (!capability) {
            note(step.stepId, 'refused', 'No registered capability matched this undo step.')
            return handOff(
              'rollback_step_unregistered',
              `Undo step ${step.stepId} matches no capability in your registry. Register it as routine_reversible to let this run unattended.`,
            )
          }

          if (capability.riskClass === 'consequential') {
            note(step.stepId, 'refused', 'Matched capability is registered as consequential.')
            return handOff(
              'rollback_step_consequential',
              `Undo step ${step.stepId} maps to a capability you registered as consequential, so it is not run unattended.`,
            )
          }

          if (!capability.validateParameters(step.parameters || {})) {
            note(step.stepId, 'refused', 'Parameters rejected by the capability.')
            return handOff('rollback_step_parameters_rejected', `Undo step ${step.stepId} carries parameters its capability does not accept.`)
          }
        }

        // ── Execute, in the order the plan declared ─────────────────────────
        for (const step of rollbackSteps) {
          let ran: { ok: boolean; summary: string; data?: Record<string, SerializableValue> }
          try {
            ran = await withTimeout(() => options.runner(step, { incident: input.incident, plan: input.plan }), stepTimeoutMs, `undo step ${step.stepId}`)
          } catch (error) {
            note(step.stepId, 'failed', error instanceof Error ? error.message : 'Undo step threw.')
            // ── Refusal 4 ──
            for (const later of rollbackSteps.slice(rollbackSteps.indexOf(step) + 1)) skipped.push(later.stepId)
            return handOff(
              'rollback_step_failed',
              `Undo step ${step.stepId} did not complete, so the remaining undo steps were not attempted. The system is partially reversed and needs a person.`,
            )
          }

          if (!ran.ok) {
            note(step.stepId, 'failed', ran.summary, ran.data)
            for (const later of rollbackSteps.slice(rollbackSteps.indexOf(step) + 1)) skipped.push(later.stepId)
            return handOff(
              'rollback_step_failed',
              `Undo step ${step.stepId} reported failure: ${ran.summary}. Remaining undo steps were not attempted.`,
            )
          }

          executed.push(step.stepId)
          note(step.stepId, 'executed', ran.summary, ran.data)
        }

        // ── The obligation: an unchecked undo is a hope ──────────────────────
        if (!options.verifier) {
          return handOff(
            'rollback_unverified',
            'Every undo step ran, but no verifier was configured, so there is no evidence the system was actually restored. Treating an unchecked undo as success is how a silent outage starts.',
          )
        }

        let recheck: VerificationResult
        try {
          recheck = await withTimeout(
            () => options.verifier!.verify({
              incident: input.incident,
              plan: input.plan,
              // The re-check is told what the ROLLBACK did, not what the repair did:
              // it is verifying the restored state, not the change that failed.
              execution: {
                status: 'completed',
                executedStepIds: executed,
                startedAt: attemptedAt,
                finishedAt: now().toISOString(),
                summary: `Rollback executed ${executed.length} undo step(s).`,
                metadata: { phase: 'rollback', planId: input.plan.planId },
              },
            }),
            stepTimeoutMs,
            'rollback verification',
          )
        } catch (error) {
          return handOff(
            'rollback_verification_unavailable',
            `The undo ran but could not be verified: ${error instanceof Error ? error.message : 'verification failed to answer'}.`,
            'unresolved',
          )
        }

        if (recheck.status === 'verified') {
          return finish('restored', 'The repair did not verify, the plan\'s undo steps ran, and the restored state verified.', 'verified')
        }

        return handOff(
          'rollback_did_not_restore',
          `The undo steps ran but the system still does not verify: ${recheck.summary}. A person is needed.`,
          recheck.status === 'failed' ? 'failed' : 'unresolved',
        )
      } catch (error) {
        // The final safety net. This module must never throw into an incident path —
        // an exception escaping here would leave the caller with no outcome at all,
        // which is indistinguishable from the undo having silently worked.
        return handOff(
          'rollback_coordinator_error',
          `The rollback coordinator failed closed: ${error instanceof Error ? error.message : 'unknown error'}.`,
        )
      }
    },
  }
}
