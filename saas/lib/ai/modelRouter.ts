// saas/lib/ai/modelRouter.ts
// Compatibility entry point for legacy callers.
// All normal SignalBoost-host text generation enters COS before raw provider compute.

import { callCosText, callCosTextDetailed, type CosTextGatewayResult } from '@/lib/cos/textGateway'
import type { ModelCallArgs } from './providerRouter.ts'

export type { ModelProvider, ModelCallArgs } from './providerRouter.ts'
export type { CosTextGatewayResult } from '@/lib/cos/textGateway'

/**
 * @deprecated New COS code should use createPlatformAiPort or cos-core directly.
 * Legacy first-party callers may still carry stale hosted-provider hints. The compatibility seam
 * deliberately normalizes them to local so old code cannot reintroduce a hidden cloud dependency.
 */
export async function callModel(args: ModelCallArgs): Promise<string | null> {
  return callCosText({ ...args, modelPreference: 'local' })
}

/** Compatibility seam for callers that must preserve actual provider/model provenance. */
export async function callModelDetailed(args: ModelCallArgs): Promise<CosTextGatewayResult | null> {
  return callCosTextDetailed({ ...args, modelPreference: 'local' })
}
