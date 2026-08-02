// saas/lib/portable-browser/adapters/private-browser-fleet-adapter.ts
//
// A browser fleet the buyer runs themselves. Credential optional — a fleet inside their own network is frequently reached without one.
//
// NEW ADAPTER. This vendor was in the catalog with no adapter file at all — a buyer could read
// its entry, see what it needs, and then find nothing to call. It runs on remote-adapter-kit.ts,
// the audited path every remote vendor here shares: configuration validated against this vendor's catalog contract, a
// credential resolved from the buyer's vault PER LAUNCH and never retained, an origin allowlist
// the buyer declares, execute_change refused, and the vendor call delegated to the transport
// THEY implement — because they hold the account, not us.
//
// Every failure throws a stable `private-browser-fleet_*` code. Those codes are the contract with a
// buyer's integration team, so they are worth reading as a set in the kit.

import { createRemoteBrowserSessionFactory, describeRemoteAdapter } from './remote-adapter-kit.ts'
import type {
  RemoteAdapterConfiguration,
  RemoteAdapterCredentialBroker,
  RemoteAdapterDefinition,
  RemoteAdapterTransport,
} from './remote-adapter-kit.ts'
import type { BrowserSessionFactory } from '../browser-task-contracts.ts'

export const PRIVATE_BROWSER_FLEET_ADAPTER_ID = 'private-browser-fleet'

export const PRIVATE_BROWSER_FLEET_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: PRIVATE_BROWSER_FLEET_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['fleetEndpoint']),
  credentialOptional: true,
})

export interface PrivateBrowserFleetAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ fleetEndpoint: string }>
}

export type PrivateBrowserFleetCredentialBroker = RemoteAdapterCredentialBroker
export type PrivateBrowserFleetTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const privateBrowserFleetAdapterStatus = describeRemoteAdapter(PRIVATE_BROWSER_FLEET_ADAPTER_DEFINITION)

export function createPrivateBrowserFleetSessionFactory(
  configuration: PrivateBrowserFleetAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(PRIVATE_BROWSER_FLEET_ADAPTER_DEFINITION, configuration)
}

export interface PrivateBrowserFleetAdapterFactory {
  create(configuration: PrivateBrowserFleetAdapterConfiguration): BrowserSessionFactory
}

export const privateBrowserFleetAdapterFactory: PrivateBrowserFleetAdapterFactory = Object.freeze({
  create: createPrivateBrowserFleetSessionFactory,
})

/**
 * Shape check for a configuration object before it reaches the factory.
 *
 * Kept because callers already import it, but no longer the near-useless `typeof value ===
 * 'object'` it used to be: it now checks the keys this vendor actually requires. It is a
 * pre-flight for a form, not a substitute for the factory — the factory is what refuses.
 */
export function validatePrivateBrowserFleetAdapterConfiguration(value: unknown): value is PrivateBrowserFleetAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { configuration?: Record<string, unknown> }
  if (!candidate.configuration || typeof candidate.configuration !== 'object') return false
  return PRIVATE_BROWSER_FLEET_ADAPTER_DEFINITION.requiredConfigurationKeys.every(
    key => typeof candidate.configuration?.[key] === 'string' && String(candidate.configuration[key]).trim().length > 0,
  )
}
