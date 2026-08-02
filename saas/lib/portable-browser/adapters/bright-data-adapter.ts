// saas/lib/portable-browser/adapters/bright-data-adapter.ts
//
// Bright Data. zone is configuration rather than a preference: it decides which pool the session comes from, and therefore where it appears to originate.
//
// NEW ADAPTER. This vendor was in the catalog with no adapter file at all — a buyer could read
// its entry, see what it needs, and then find nothing to call. It runs on remote-adapter-kit.ts,
// the audited path every remote vendor here shares: configuration validated against this vendor's catalog contract, a
// credential resolved from the buyer's vault PER LAUNCH and never retained, an origin allowlist
// the buyer declares, execute_change refused, and the vendor call delegated to the transport
// THEY implement — because they hold the account, not us.
//
// Every failure throws a stable `bright-data_*` code. Those codes are the contract with a
// buyer's integration team, so they are worth reading as a set in the kit.

import { createRemoteBrowserSessionFactory, describeRemoteAdapter } from './remote-adapter-kit.ts'
import type {
  RemoteAdapterConfiguration,
  RemoteAdapterCredentialBroker,
  RemoteAdapterDefinition,
  RemoteAdapterTransport,
} from './remote-adapter-kit.ts'
import type { BrowserSessionFactory } from '../browser-task-contracts.ts'

export const BRIGHT_DATA_ADAPTER_ID = 'bright-data'

export const BRIGHT_DATA_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: BRIGHT_DATA_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['endpoint', 'zone']),
})

export interface BrightDataAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ endpoint: string; zone: string }>
}

export type BrightDataCredentialBroker = RemoteAdapterCredentialBroker
export type BrightDataTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const brightDataAdapterStatus = describeRemoteAdapter(BRIGHT_DATA_ADAPTER_DEFINITION)

export function createBrightDataSessionFactory(
  configuration: BrightDataAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(BRIGHT_DATA_ADAPTER_DEFINITION, configuration)
}

export interface BrightDataAdapterFactory {
  create(configuration: BrightDataAdapterConfiguration): BrowserSessionFactory
}

export const brightDataAdapterFactory: BrightDataAdapterFactory = Object.freeze({
  create: createBrightDataSessionFactory,
})

/**
 * Shape check for a configuration object before it reaches the factory.
 *
 * Kept because callers already import it, but no longer the near-useless `typeof value ===
 * 'object'` it used to be: it now checks the keys this vendor actually requires. It is a
 * pre-flight for a form, not a substitute for the factory — the factory is what refuses.
 */
export function validateBrightDataAdapterConfiguration(value: unknown): value is BrightDataAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { configuration?: Record<string, unknown> }
  if (!candidate.configuration || typeof candidate.configuration !== 'object') return false
  return BRIGHT_DATA_ADAPTER_DEFINITION.requiredConfigurationKeys.every(
    key => typeof candidate.configuration?.[key] === 'string' && String(candidate.configuration[key]).trim().length > 0,
  )
}
