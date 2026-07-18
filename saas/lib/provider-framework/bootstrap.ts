import type { UniversalProviderSdk } from './types.ts'
import { UniversalProviderRegistry } from './registry.ts'
import { GitHubProvider } from './github.ts'

/**
 * Canonical built-in provider catalog.
 *
 * Provider modules define adapters and metadata; this catalog is the single place
 * that makes those providers discoverable by the Universal Provider Framework.
 */
export const BUILT_IN_UNIVERSAL_PROVIDERS: readonly UniversalProviderSdk[] = Object.freeze([
  GitHubProvider,
])

/** Create an isolated, fully bootstrapped registry for a runtime or test scope. */
export function createUniversalProviderRegistry(): UniversalProviderRegistry {
  const registry = new UniversalProviderRegistry()
  for (const provider of BUILT_IN_UNIVERSAL_PROVIDERS) registry.register(provider)
  return registry
}

/**
 * Process-local canonical registry used by application code that does not need an
 * isolated registry. Consumers may discover GitHub by provider id or capability
 * without manually registering it first.
 */
export const universalProviderRegistry = createUniversalProviderRegistry()
