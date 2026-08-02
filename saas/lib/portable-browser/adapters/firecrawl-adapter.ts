// saas/lib/portable-browser/adapters/firecrawl-adapter.ts
//
// Firecrawl. A read-oriented vendor, which suits this adapter: execute_change is refused by the kit for every vendor anyway.
//
// WAS A FOUR-LINE STUB whose create() returned `never` and whose status published
// `requiredPorts: []` — a declaration that a buyer needed nothing, which was false and
// unhelpful in the same breath. It now runs on remote-adapter-kit.ts, the audited path every
// remote vendor here shares: configuration validated against this vendor's catalog contract, a
// credential resolved from the buyer's vault PER LAUNCH and never retained, an origin allowlist
// the buyer declares, execute_change refused, and the vendor call delegated to the transport
// THEY implement — because they hold the account, not us.
//
// Every failure throws a stable `firecrawl_*` code. Those codes are the contract with a
// buyer's integration team, so they are worth reading as a set in the kit.

import { createRemoteBrowserSessionFactory, describeRemoteAdapter } from './remote-adapter-kit.ts'
import type {
  RemoteAdapterConfiguration,
  RemoteAdapterCredentialBroker,
  RemoteAdapterDefinition,
  RemoteAdapterTransport,
} from './remote-adapter-kit.ts'
import type { BrowserSessionFactory } from '../browser-task-contracts.ts'

export const FIRECRAWL_ADAPTER_ID = 'firecrawl'

export const FIRECRAWL_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: FIRECRAWL_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['apiBaseUrl']),
})

export interface FirecrawlAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ apiBaseUrl: string }>
}

export type FirecrawlCredentialBroker = RemoteAdapterCredentialBroker
export type FirecrawlTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const firecrawlAdapterStatus = describeRemoteAdapter(FIRECRAWL_ADAPTER_DEFINITION)

export function createFirecrawlSessionFactory(
  configuration: FirecrawlAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(FIRECRAWL_ADAPTER_DEFINITION, configuration)
}

export interface FirecrawlAdapterFactory {
  create(configuration: FirecrawlAdapterConfiguration): BrowserSessionFactory
}

export const firecrawlAdapterFactory: FirecrawlAdapterFactory = Object.freeze({
  create: createFirecrawlSessionFactory,
})

/**
 * Shape check for a configuration object before it reaches the factory.
 *
 * Kept because callers already import it, but no longer the near-useless `typeof value ===
 * 'object'` it used to be: it now checks the keys this vendor actually requires. It is a
 * pre-flight for a form, not a substitute for the factory — the factory is what refuses.
 */
export function validateFirecrawlAdapterConfiguration(value: unknown): value is FirecrawlAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { configuration?: Record<string, unknown> }
  if (!candidate.configuration || typeof candidate.configuration !== 'object') return false
  return FIRECRAWL_ADAPTER_DEFINITION.requiredConfigurationKeys.every(
    key => typeof candidate.configuration?.[key] === 'string' && String(candidate.configuration[key]).trim().length > 0,
  )
}
