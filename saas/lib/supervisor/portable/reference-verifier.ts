// saas/lib/supervisor/portable/reference-verifier.ts
//
// THE REFERENCE VERIFIER.
//
// The orchestrator has always required a Verifier, and refuses to report a repair as
// `completed` unless verification passes. But the Verifier interface had no
// implementation anywhere in this repository — a buyer met a bare type and, until
// they wrote one, every repair correctly but uselessly reported `unresolved`.
//
// This is that implementation. It runs the repair plan's OWN verificationSteps, which
// the plan schema already requires to be non-empty: "a repair that cannot be checked
// afterwards is not a repair."
//
// THE CENTRAL DISTINCTION, and the reason this file is careful rather than short:
//
//     failed      = we checked, and the repair did NOT work.
//     unresolved  = we could NOT check, so we do not know.
//
// Collapsing those two is the failure that matters. Reporting `verified` because no
// check could run would tell an operator a production incident is closed when nobody
// looked at it. So every path that cannot produce evidence returns `unresolved` with
// a named reason, and `verified` is reachable only when a real check actually ran and
// actually passed.

import type { SerializableValue, SupervisorIncident } from '../incident-schema.ts'
import type { RepairPlan, RepairStep } from '../repair-plan-schema.ts'
import type { ExecutionResult, VerificationResult, Verifier } from '../execution-contracts.ts'

// Verification observes; it never changes anything. These are the only actions a
// verification step may use — a "verification" that mutates is not verification, and
// a plan proposing one is a defective plan rather than a failed repair.
export const READ_ONLY_VERIFICATION_ACTIONS = Object.freeze(['read', 'screenshot', 'verify'] as const)

export const VERIFIER_DEFAULTS = Object.freeze({
  stepTimeoutMs: 15_000,
})

// Flat result shape rather than a discriminated union: this repo's tsconfig is
// non-strict, so `!result.ok` would not narrow a union and `summary` would be
// unreachable to callers. Same reason as the intake contract's authenticate().
export interface VerificationCheckResult {
  ok: boolean
  summary: string
  data?: Record<string, SerializableValue>
}

// The buyer supplies this: how to perform one read against their own systems. It is
// the only capability the verifier needs, and it is deliberately read-shaped — there
// is no way to express a mutation through it.
export interface VerificationStepRunner {
  (step: RepairStep, context: { incident: SupervisorIncident; plan: RepairPlan; execution: ExecutionResult }): Promise<VerificationCheckResult> | VerificationCheckResult
}

export interface ReferenceVerifierOptions {
  runner?: VerificationStepRunner
  stepTimeoutMs?: number
  now?: () => Date
}

const isReadOnly = (step: RepairStep) => (READ_ONLY_VERIFICATION_ACTIONS as readonly string[]).includes(step.action)

function result(status: VerificationResult['status'], summary: string, errors: string[], now: Date, metadata?: Record<string, SerializableValue>): VerificationResult {
  return Object.freeze({
    status,
    verifiedAt: now.toISOString(),
    summary,
    errors: Object.freeze([...errors]) as unknown as string[],
    ...(metadata ? { metadata } : {}),
  })
}

async function withTimeout(run: () => Promise<VerificationCheckResult> | VerificationCheckResult, ms: number): Promise<VerificationCheckResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(run),
      // A hung check is indistinguishable from a check that will never answer, and
      // an orchestration that waits forever is an outage. The timeout throws so the
      // caller treats it as "could not check", never as a pass.
      new Promise<VerificationCheckResult>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`verification step timed out after ${ms}ms`)), ms) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function createReferenceVerifier(options: ReferenceVerifierOptions = {}): Verifier {
  const stepTimeoutMs = options.stepTimeoutMs ?? VERIFIER_DEFAULTS.stepTimeoutMs
  const now = options.now ?? (() => new Date())

  return {
    async verify({ incident, plan, execution }) {
      const at = now()

      // Nothing ran, so there is nothing to verify. Saying `failed` here would blame
      // the repair for an execution that never happened.
      if (execution.status !== 'completed') {
        return result('unresolved', 'Execution did not complete, so no verification was attempted.', [`execution_status:${execution.status}`], at)
      }

      // The honest answer when a deployment has not bound a runner yet. This is the
      // single most important branch in the file: without it the obvious shortcut is
      // to return `verified` and quietly close real incidents.
      if (typeof options.runner !== 'function') {
        return result('unresolved', 'No VerificationStepRunner is configured, so the repair could not be checked.', ['verifier_not_configured'], at)
      }

      const steps = plan.verificationSteps ?? []
      if (steps.length === 0) {
        return result('unresolved', 'The repair plan carried no verification steps.', ['no_verification_steps'], at)
      }

      const mutating = steps.filter(step => !isReadOnly(step))
      if (mutating.length > 0) {
        // A plan defect, not a repair failure — reported as such, and nothing is run.
        // Running the read-only subset and passing would be worse: it would report a
        // verified repair on the strength of a plan we already know is malformed.
        return result(
          'unresolved',
          'The repair plan proposed verification steps that are not read-only, so no verification was run.',
          mutating.map(step => `step_not_read_only:${step.stepId}:${step.action}`),
          at,
        )
      }

      const errors: string[] = []
      let passed = 0
      let couldNotCheck = 0

      for (const step of steps) {
        let check: VerificationCheckResult
        try {
          check = await withTimeout(() => options.runner!(step, { incident, plan, execution }), stepTimeoutMs)
        } catch (error) {
          // The check itself could not run. That is not evidence the repair failed.
          couldNotCheck += 1
          errors.push(`check_error:${step.stepId}:${error instanceof Error ? error.message : 'unknown error'}`)
          continue
        }

        if (!check || typeof check.ok !== 'boolean') {
          couldNotCheck += 1
          errors.push(`invalid_check_result:${step.stepId}`)
          continue
        }

        if (!check.ok) {
          errors.push(`check_failed:${step.stepId}:${String(check.summary ?? '').slice(0, 200)}`)
          continue
        }

        // When the plan states what it expects to see, the check must actually show
        // it. A runner reporting ok:true while the observed output contradicts the
        // expectation is the quiet way a verification becomes a rubber stamp.
        if (step.expectedResult) {
          const observed = `${check.summary ?? ''} ${check.data ? JSON.stringify(check.data) : ''}`.toLowerCase()
          if (!observed.includes(step.expectedResult.toLowerCase())) {
            errors.push(`expectation_not_met:${step.stepId}:expected:${step.expectedResult.slice(0, 120)}`)
            continue
          }
        }

        passed += 1
      }

      const metadata: Record<string, SerializableValue> = { stepsTotal: steps.length, stepsPassed: passed, stepsUncheckable: couldNotCheck }

      if (passed === steps.length) {
        return result('verified', `All ${steps.length} verification step(s) passed.`, [], at, metadata)
      }

      // Any step we could not check leaves the overall answer unknown, even if every
      // other step passed — a partially-observed system is not a verified one.
      if (couldNotCheck > 0) {
        return result('unresolved', `${couldNotCheck} of ${steps.length} verification step(s) could not be checked.`, errors, at, metadata)
      }

      return result('failed', `${steps.length - passed} of ${steps.length} verification step(s) did not pass.`, errors, at, metadata)
    },
  }
}
