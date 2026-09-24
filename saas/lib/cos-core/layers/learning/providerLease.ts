// saas/lib/cos-core/layers/learning/providerLease.ts
import { randomUUID } from 'node:crypto'
import type { ContinuousLearningSourceAdapter } from './cycle.ts'
import { cosServiceDb } from '../../storage/service-db.ts'

type LeaseOutcome = 'ok' | 'error' | 'rate_limited' | 'timeout'

export type LearningSourceProviderLeasePort = {
  claim(input: { providerId: string; leaseId: string; holder: string; ttlSeconds: number }): Promise<boolean>
  release(input: { providerId: string; leaseId: string; outcome: LeaseOutcome; cooldownSeconds: number; error?: string | null }): Promise<void>
}

export type LearningSourceProviderLeasePolicy = Readonly<{
  providerId: string
  ttlSeconds: number
  successCooldownSeconds: number
  errorCooldownSeconds: number
  rateLimitCooldownSeconds: number
  timeoutCooldownSeconds: number
}>

const POLICY_BY_ADAPTER: Readonly<Record<string, LearningSourceProviderLeasePolicy>> = Object.freeze({
  openalex: Object.freeze({ providerId: 'openalex', ttlSeconds: 30, successCooldownSeconds: 1, errorCooldownSeconds: 30, rateLimitCooldownSeconds: 60, timeoutCooldownSeconds: 30 }),
  openalex_semantic: Object.freeze({ providerId: 'openalex', ttlSeconds: 30, successCooldownSeconds: 1, errorCooldownSeconds: 30, rateLimitCooldownSeconds: 60, timeoutCooldownSeconds: 30 }),
  semantic_scholar: Object.freeze({ providerId: 'semantic_scholar', ttlSeconds: 30, successCooldownSeconds: 2, errorCooldownSeconds: 120, rateLimitCooldownSeconds: 900, timeoutCooldownSeconds: 120 }),
  europe_pmc: Object.freeze({ providerId: 'europe_pmc', ttlSeconds: 45, successCooldownSeconds: 1, errorCooldownSeconds: 60, rateLimitCooldownSeconds: 120, timeoutCooldownSeconds: 60 }),
  hf_nist_cc0: Object.freeze({ providerId: 'huggingface_datasets', ttlSeconds: 30, successCooldownSeconds: 1, errorCooldownSeconds: 60, rateLimitCooldownSeconds: 120, timeoutCooldownSeconds: 120 }),
  hf_github_cc0: Object.freeze({ providerId: 'huggingface_datasets', ttlSeconds: 30, successCooldownSeconds: 1, errorCooldownSeconds: 60, rateLimitCooldownSeconds: 120, timeoutCooldownSeconds: 120 }),
  hf_arxiv_cc0: Object.freeze({ providerId: 'huggingface_datasets', ttlSeconds: 30, successCooldownSeconds: 1, errorCooldownSeconds: 60, rateLimitCooldownSeconds: 120, timeoutCooldownSeconds: 120 }),
})

export function learningSourceProviderLeasePolicy(adapterId: string | undefined): LearningSourceProviderLeasePolicy | null {
  const id = String(adapterId || '').trim()
  return id ? POLICY_BY_ADAPTER[id] ?? null : null
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500)
  return String(error || 'unknown').slice(0, 500)
}

export function learningSourceProviderOutcome(error: unknown): { outcome: LeaseOutcome; message: string } {
  const message = errorText(error)
  if (/\b429\b|rate.?limit|too many requests/i.test(message)) return { outcome: 'rate_limited', message }
  if (/aborted|timeout|timed out/i.test(message)) return { outcome: 'timeout', message }
  return { outcome: 'error', message }
}

export function createSupabaseLearningSourceProviderLeasePort(): LearningSourceProviderLeasePort {
  return {
    async claim(input) {
      const db = cosServiceDb()
      if (!db) throw new Error('learning_provider_lease_database_unavailable')
      const result = await db.rpc('claim_cos_learning_source_provider_lease', {
        p_provider_id: input.providerId,
        p_lease_id: input.leaseId,
        p_holder: input.holder,
        p_ttl_seconds: input.ttlSeconds,
      })
      if (result.error) throw result.error
      return result.data === true
    },
    async release(input) {
      const db = cosServiceDb()
      if (!db) throw new Error('learning_provider_lease_database_unavailable')
      const result = await db.rpc('release_cos_learning_source_provider_lease', {
        p_provider_id: input.providerId,
        p_lease_id: input.leaseId,
        p_outcome: input.outcome,
        p_cooldown_seconds: input.cooldownSeconds,
        p_error: input.error ?? null,
      })
      if (result.error) throw result.error
    },
  }
}

/**
 * Cross-serverless provider coordination. A source that cannot claim its provider lease simply
 * returns no candidates for this gap/cycle; another lane already owns the provider or the provider
 * is inside a durable cooldown. Real upstream failures are re-thrown so existing source-error
 * telemetry remains truthful.
 */
export function withSharedLearningSourceProviderLease(
  adapter: ContinuousLearningSourceAdapter,
  holder: string,
  port: LearningSourceProviderLeasePort = createSupabaseLearningSourceProviderLeasePort(),
): ContinuousLearningSourceAdapter {
  const policy = learningSourceProviderLeasePolicy(adapter.id)
  if (!policy) return adapter

  return {
    kind: adapter.kind,
    id: adapter.id,
    async acquire(gap) {
      const leaseId = randomUUID()
      const claimed = await port.claim({
        providerId: policy.providerId,
        leaseId,
        holder: String(holder || 'cos-learning').slice(0, 160),
        ttlSeconds: policy.ttlSeconds,
      })
      if (!claimed) return []

      try {
        const documents = await adapter.acquire(gap)
        await port.release({
          providerId: policy.providerId,
          leaseId,
          outcome: 'ok',
          cooldownSeconds: policy.successCooldownSeconds,
        })
        return documents
      } catch (error) {
        const failure = learningSourceProviderOutcome(error)
        const cooldownSeconds = failure.outcome === 'rate_limited'
          ? policy.rateLimitCooldownSeconds
          : failure.outcome === 'timeout'
            ? policy.timeoutCooldownSeconds
            : policy.errorCooldownSeconds
        try {
          await port.release({
            providerId: policy.providerId,
            leaseId,
            outcome: failure.outcome,
            cooldownSeconds,
            error: failure.message,
          })
        } catch (releaseError) {
          console.warn('cosLearning: provider lease release failed', {
            provider: policy.providerId,
            source: adapter.id ?? adapter.kind,
            error: errorText(releaseError),
          })
        }
        throw error
      }
    },
  }
}

export function withSharedLearningSourceProviderLeases(
  adapters: readonly ContinuousLearningSourceAdapter[],
  holder: string,
  port?: LearningSourceProviderLeasePort,
): ContinuousLearningSourceAdapter[] {
  return adapters.map(adapter => withSharedLearningSourceProviderLease(adapter, holder, port))
}
