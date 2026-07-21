// saas/press-media-core/index.ts
// Press & Media portable core — barrel. Host wires the Ports (AI/email/notify) and adds
// paid adapters; the free reference adapter is registered by default.
export * from './types'
export * from './registry'
export { createFreeSubmissionAdapter } from './adapters/free-submission'
export { createPrWireAdapter } from './adapters/pr-wire'

import { createRegistry, MediaProviderRegistry } from './registry'
import { createFreeSubmissionAdapter } from './adapters/free-submission'

// A host builds its registry from this and registers its own paid adapters, e.g.
//   const r = createDefaultMediaRegistry(); r.register(createPrWireAdapter());
export function createDefaultMediaRegistry(): MediaProviderRegistry {
  return createRegistry(createFreeSubmissionAdapter())
}
