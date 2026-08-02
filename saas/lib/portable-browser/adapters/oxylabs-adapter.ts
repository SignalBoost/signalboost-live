// saas/lib/portable-browser/adapters/oxylabs-adapter.ts
//
// Oxylabs. The buyer transport reaches their own endpoint with their own credential.
//
// NEW ADAPTER. This vendor was in the catalog with no adapter file at all — a buyer could read
// its entry, see what it needs, and then find nothing to call. It runs on remote-adapter-kit.ts,
// the audited path every remote vendor here shares: configuration validated against this vendor's catalog contract, a
// credential resolved from the buyer's vault PER LAUNCH and never retained, an origin allowlist
// the buyer declares, execute_change refused, and the vendor call delegated to the transport
// THEY implement — because they hold the account, not us.
//
// Every failure throws a stable `oxylabs_*` code. Those codes are the contract with a
// buyer's integration team, so they are worth reading as a set in the kit.

import { createRemoteBrowserSessionFactory, describeRemoteAdapter } from './remote-adapter-kit.ts'
import type {
  RemoteAdapterConfiguration,
  RemoteAdapterCredentialBroker,
  RemoteAdapterDefinition,
  RemoteAdapterTransport,
} from './remote-adapter-kit.ts'
import type { BrowserSessionFactory } from '../browser-task-contracts.ts'

export const OXYLABS_ADAPTER_ID = 'oxylabs'

export const OXYLABS_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: OXYLABS_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['endpoint']),
})

export interface OxylabsAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ endpoint: string }>
}

export type OxylabsCredentialBroker = RemoteAdapterCredentialBroker
export type OxylabsTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const oxylabsAdapterStatus = describeRemoteAdapter(OXYLABS_ADAPTER_DEFINITION)

export function createOxylabsSessionFactory(
  configuration: OxylabsAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(OXYLABS_ADAPTER_DEFINITION, configuration)
}

export interface OxylabsAdapterFactory {
  create(configuration: OxylabsAdapterConfiguration): BrowserSessionFactory
}

export const oxylabsAdapterFactory: OxylabsAdapterFactory = Object.freeze({
  create: createOxylabsSessionFactory,
})

/**
 * Shape check for a configuration object before it reaches the factory.
 *
 * Kept because callers already import it, but no longer the near-useless `typeof value ===
 * 'object'` it used to be: it now checks the keys this vendor actually requires. It is a
 * pre-flight for a form, not a substitute for the factory — the factory is what refuses.
 */
export function validateOxylabsAdapterConfiguration(value: unknown): value is OxylabsAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { configuration?: Record<string, unknown> }
  if (!candidate.configuration || typeof candidate.configuration !== 'object') return false
  return OXYLABS_ADAPTER_DEFINITION.requiredConfigurationKeys.every(
    key => typeof candidate.configuration?.[key] === 'string' && String(candidate.configuration[key]).trim().length > 0,
  )
}
