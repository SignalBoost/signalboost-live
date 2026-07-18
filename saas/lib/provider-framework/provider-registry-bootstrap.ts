// saas/lib/provider-framework/provider-registry-bootstrap.ts
//
// The canonical, process-wide Universal Provider Framework registry.
// Every onboarded provider registers here exactly once. Consumers — dashboards,
// Policy, Dispatcher, schedulers, the Supervisor Ops Center — must discover
// providers and capabilities THROUGH this registry rather than importing provider
// modules directly. Registration is pure metadata: no network calls, no
// credentials, no mutations. This is the piece that turns the framework from
// test-only into a live production registry.
//
// To onboard a new provider: add its SDK singleton to PROVIDERS below.

import { UniversalProviderRegistry } from './registry.ts'
import type { UniversalProviderSdk } from './types.ts'
import { GitHubProvider } from './github.ts'

const PROVIDERS: readonly UniversalProviderSdk[] = [GitHubProvider]

export function buildUniversalProviderRegistry(): UniversalProviderRegistry {
  const registry = new UniversalProviderRegistry()
  for (const provider of PROVIDERS) registry.register(provider)
  return registry
}

let cached: UniversalProviderRegistry | null = null

/** Lazy process-wide singleton. Safe to call from any server context. */
export function getUniversalProviderRegistry(): UniversalProviderRegistry {
  if (!cached) cached = buildUniversalProviderRegistry()
  return cached
}
