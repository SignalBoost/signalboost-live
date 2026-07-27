import type { SerializableValue, SupervisorIncident } from '../incident-schema.ts'
import type { ExecutionResult, VerificationResult, Verifier } from '../execution-contracts.ts'
import type { RepairPlan, RepairStep } from '../repair-plan-schema.ts'

export const referenceVerifierSchemaVersion = 'reference-verifier-v1'
export const readOnlyVerificationActions = Object.freeze(['read', 'verify', 'screenshot'] as const)

type ReadOnlyVerificationAction = (typeof readOnlyVerificationActions)[number]

export interface VerificationStepObservation {
  ok: boolean
  summary: string
  data?: Record<string, SerializableValue>
}

export interface VerificationStepRunner {
  (input: {
    incident: SupervisorIncident
    plan: RepairPlan
    execution: ExecutionResult
    step: RepairStep & { action: ReadOnlyVerificationAction }
  }): Promise<VerificationStepObservation> | VerificationStepObservation
}

export interface ReferenceVerifierOptions {
  runner: VerificationStepRunner
  now?: () => Date
}

export class ReferenceVerifierConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReferenceVerifierConfigError'
  }
}

function result(
  now: () => Date,
  status: VerificationResult['status'],
  summary: string,
  errors: string[],
  metadata: Record<string, SerializableValue>,
): VerificationResult {
  return {
    status,
    verifiedAt: now().toISOString(),
    summary,
    errors,
    metadata: {
      verifierSchemaVersion: referenceVerifierSchemaVersion,
      ...metadata,
    },
  }
}

export function createReferenceVerifier(options: ReferenceVerifierOptions): Verifier {
  if (!options || typeof options.runner !== 'function') {
    throw new ReferenceVerifierConfigError('verification step runner is required')
  }

  const now = options.now ?? (() => new Date())

  return {
    async verify({ incident, plan, execution }): Promise<VerificationResult> {
      if (execution.status !== 'completed') {
        return result(now, 'unresolved', 'Repair execution did not complete; verification was not attempted.', [
          `execution_status_${execution.status}`,
        ], {
          executedVerificationStepIds: [],
          failedVerificationStepIds: [],
        })
      }

      if (!Array.isArray(plan.verificationSteps) || plan.verificationSteps.length === 0) {
        return result(now, 'failed', 'Repair plan has no verification steps.', ['verification_steps_required'], {
          executedVerificationStepIds: [],
          failedVerificationStepIds: [],
        })
      }

      const executedVerificationStepIds: string[] = []
      const failedVerificationStepIds: string[] = []
      const errors: string[] = []
      const observations: Record<string, SerializableValue> = {}

      for (const step of plan.verificationSteps) {
        if (step.protectedAction) {
          failedVerificationStepIds.push(step.stepId)
          errors.push(`${step.stepId}: protected verification steps are not allowed`)
          break
        }

        if (!readOnlyVerificationActions.includes(step.action as ReadOnlyVerificationAction)) {
          failedVerificationStepIds.push(step.stepId)
          errors.push(`${step.stepId}: action ${step.action} is not read-only`)
          break
        }

        try {
          const observation = await options.runner({
            incident,
            plan,
            execution,
            step: step as RepairStep & { action: ReadOnlyVerificationAction },
          })

          executedVerificationStepIds.push(step.stepId)
          observations[step.stepId] = {
            ok: observation.ok,
            summary: observation.summary,
            ...(observation.data ? { data: observation.data } : {}),
          }

          if (!observation.ok) {
            failedVerificationStepIds.push(step.stepId)
            errors.push(`${step.stepId}: ${observation.summary}`)
            break
          }
        } catch (error) {
          failedVerificationStepIds.push(step.stepId)
          errors.push(`${step.stepId}: ${error instanceof Error ? error.message : 'verification runner threw'}`)
          break
        }
      }

      const metadata: Record<string, SerializableValue> = {
        executedVerificationStepIds,
        failedVerificationStepIds,
        observations,
      }

      if (errors.length > 0) {
        return result(now, 'failed', 'Post-repair verification failed.', errors, metadata)
      }

      if (executedVerificationStepIds.length !== plan.verificationSteps.length) {
        return result(now, 'unresolved', 'Not every verification step completed.', ['verification_incomplete'], metadata)
      }

      return result(now, 'verified', `Verified ${executedVerificationStepIds.length} post-repair step(s).`, [], metadata)
    },
  }
}
