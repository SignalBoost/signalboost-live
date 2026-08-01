// saas/press-media-core/index.ts
// Press & Media portable core — barrel. Host wires the Ports (AI/email/notify) and adds
// paid adapters; the free reference adapter is registered by default.
export * from './types.ts'
export * from './rules.ts'
export * from './registry.ts'
export { createFreeSubmissionAdapter } from './adapters/free-submission.ts'
export { createPrWireAdapter } from './adapters/pr-wire.ts'
export { createAdPlatformAdapter } from './adapters/ad-platform.ts'
export { createDirectIoAdapter } from './adapters/direct-io.ts'
export { createMediaDatabaseAdapter, verifyTargetAgainstDatabase } from './adapters/media-database.ts'
export { findPublications, leadToTarget } from './discovery.ts'
export { runPressAcceptance } from './acceptance-harness.ts'
export type { PressAcceptanceOptions, PressAcceptanceResult, PressCheck, PressCheckId } from './acceptance-harness.ts'

import { createRegistry, MediaProviderRegistry } from './registry.ts'
import { createFreeSubmissionAdapter } from './adapters/free-submission.ts'

// A host builds its registry from this and registers its own paid adapters, e.g.
//   const r = createDefaultMediaRegistry(); r.register(createPrWireAdapter());
export function createDefaultMediaRegistry(): MediaProviderRegistry {
  return createRegistry(createFreeSubmissionAdapter())
}
