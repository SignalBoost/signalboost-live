import type { UniversalProviderCapability } from './types.ts'
import { assertProviderExecutionAllowed, recordProviderExecutionFailure } from './supervisor-contract.ts'

export const SUPERVISED_PROVIDER_EXECUTOR_VERSION = 'supervised-provider-executor-v1' as const

export type SupervisedProviderFailure = Readonly<{
  kind?: string
  message?: string
  retryable?: boolean
  status?: number
}>

function observations(error: SupervisedProviderFailure | unknown): string[] {
  if (!error || typeof error !== 'object') return [String(error || 'unknown provider failure')]
  const value = error as Record<string, unknown>
  return [
    String(value.kind || ''),
    String(value.message || ''),
    value.status == null ? '' : String(value.status),
    value.retryable == null ? '' : `retryable=${String(value.retryable)}`,
  ].filter(Boolean)
}

/**
 * Canonical execution boundary for Universal Provider Framework network work.
 *
 * Adapters hand their actual provider call to this executor. The executor owns
 * the mandatory Self-Healing preflight and failure observation. This prevents
 * an adapter from accidentally implementing retries without consulting the
 * Supervisor circuit first.
 */
export async function executeSupervisedProviderCall<T>(input: {
  db: any
  providerId: string
  capability: UniversalProviderCapability | string
  costBearing?: boolean
  execute: () => Promise<T>
  isFailure?: (value: T) => SupervisedProviderFailure | null
  evidence?: Record<string, unknown>
}): Promise<T> {
  await assertProviderExecutionAllowed({
    db: input.db,
    providerId: input.providerId,
    capability: input.capability,
    costBearing: input.costBearing,
  })

  try {
    const value = await input.execute()
    const failure = input.isFailure?.(value) || null
    if (failure) {
      await recordProviderExecutionFailure({
        db: input.db,
        providerId: input.providerId,
        capability: input.capability,
        observations: observations(failure),
        evidence: {
          executor: SUPERVISED_PROVIDER_EXECUTOR_VERSION,
          ...(input.evidence || {}),
        },
      })
    }
    return value
  } catch (error) {
    await recordProviderExecutionFailure({
      db: input.db,
      providerId: input.providerId,
      capability: input.capability,
      observations: observations(error),
      evidence: {
        executor: SUPERVISED_PROVIDER_EXECUTOR_VERSION,
        thrown: true,
        ...(input.evidence || {}),
      },
    })
    throw error
  }
}
