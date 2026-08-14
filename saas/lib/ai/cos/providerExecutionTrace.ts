import {
  withProviderExecutionTrace as withRawProviderExecutionTrace,
  type ProviderExecutionTrace,
} from '@/lib/ai/providerRouter'

export type { ProviderExecutionTrace }

/**
 * COS-only request-scoped observability seam. Feature/API routes must not import
 * providerRouter directly; this adapter preserves the provider boundary while
 * exposing only execution provenance, never provider credentials or raw compute.
 */
export async function withCosProviderExecutionTrace<T>(work: () => Promise<T>): Promise<{ result: T; trace: ProviderExecutionTrace }> {
  return withRawProviderExecutionTrace(work)
}
