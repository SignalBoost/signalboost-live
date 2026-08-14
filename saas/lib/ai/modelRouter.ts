// saas/lib/ai/modelRouter.ts
// Compatibility entry point for legacy callers.
// All normal SignalBoost-host text generation enters COS before raw provider compute.

import { callCosText, callCosTextDetailed, type CosTextGatewayResult } from '@/lib/cos/textGateway'
import type { ModelCallArgs } from './providerRouter'

export type { ModelProvider, ModelCallArgs } from './providerRouter'
export type { CosTextGatewayResult } from '@/lib/cos/textGateway'

/** @deprecated New COS code should use createPlatformAiPort or cos-core directly. */
export async function callModel(args: ModelCallArgs): Promise<string | null> {
  return callCosText(args)
}

/** Compatibility seam for callers that must preserve actual provider/model provenance. */
export async function callModelDetailed(args: ModelCallArgs): Promise<CosTextGatewayResult | null> {
  return callCosTextDetailed(args)
}
