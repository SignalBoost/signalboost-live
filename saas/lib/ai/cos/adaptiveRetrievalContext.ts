import { AsyncLocalStorage } from 'node:async_hooks'

export type AdaptiveRetrievalShadowPolicy = {
  policyId?: string | null
  mode?: 'shadow_validation' | 'shadow_observation'
  learnedCorpusMaxInjected?: number | null
  learnedCorpusMinSimilarity?: number | null
}

type AdaptiveRetrievalState = {
  policy: AdaptiveRetrievalShadowPolicy | null
}

const storage = new AsyncLocalStorage<AdaptiveRetrievalState>()

function normalizePolicy(policy: AdaptiveRetrievalShadowPolicy | null | undefined): AdaptiveRetrievalShadowPolicy | null {
  if (!policy) return null
  const maxInjected = Number(policy.learnedCorpusMaxInjected)
  const minSimilarity = Number(policy.learnedCorpusMinSimilarity)
  return {
    policyId: policy.policyId ? String(policy.policyId).slice(0, 120) : null,
    mode: policy.mode === 'shadow_observation' ? 'shadow_observation' : 'shadow_validation',
    learnedCorpusMaxInjected: Number.isFinite(maxInjected)
      ? Math.max(0, Math.min(12, Math.floor(maxInjected)))
      : null,
    learnedCorpusMinSimilarity: Number.isFinite(minSimilarity)
      ? Math.max(0, Math.min(1, minSimilarity))
      : null,
  }
}

/**
 * Apply a retrieval candidate only inside this async execution chain.
 * Normal Production traffic has no state here and therefore keeps the existing live policy.
 */
export async function withAdaptiveRetrievalShadowPolicy<T>(
  policy: AdaptiveRetrievalShadowPolicy,
  operation: () => Promise<T>,
): Promise<T> {
  return storage.run({ policy: normalizePolicy(policy) }, operation)
}

export function currentAdaptiveRetrievalShadowPolicy(): AdaptiveRetrievalShadowPolicy | null {
  return storage.getStore()?.policy ?? null
}

/** Preserve the caller's live default unless an explicit shadow validation override exists. */
export function effectiveLearnedCorpusInjectionLimit(defaultLimit: number): number {
  const safeDefault = Math.max(0, Math.floor(Number(defaultLimit) || 0))
  const override = currentAdaptiveRetrievalShadowPolicy()?.learnedCorpusMaxInjected
  return override == null ? safeDefault : Math.min(safeDefault, Math.max(0, Math.floor(override)))
}
