// saas/lib/ai/modelRouter.ts
// Compatibility entry point for legacy callers.
// All normal SignalBoost-host text generation enters COS before raw provider compute.

import { callCosText } from '@/lib/cos/textGateway'
import type { ModelCallArgs } from './providerRouter'

export type { ModelProvider, ModelCallArgs } from './providerRouter'

/** @deprecated New COS code should use createPlatformAiPort or cos-core directly. */
export async function callModel(args: ModelCallArgs): Promise<string | null> {
  return callCosText(args)
}
