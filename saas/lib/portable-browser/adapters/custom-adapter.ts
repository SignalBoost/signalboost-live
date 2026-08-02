// saas/lib/portable-browser/adapters/custom-adapter.ts
//
// A browser stack we have never heard of. This is the escape hatch that makes the catalog a floor rather than a ceiling: the buyer names their endpoint and their own adapter module, and the credential is OPTIONAL because an internal grid often needs none.
//
// WAS A FOUR-LINE STUB whose create() returned `never` and whose status published
// `requiredPorts: []` — a declaration that a buyer needed nothing, which was false and
// unhelpful in the same breath. It now runs on remote-adapter-kit.ts, the audited path every
// remote vendor here shares: configuration validated against this vendor's catalog contract, a
// credential resolved from the buyer's vault PER LAUNCH and never retained, an origin allowlist
// the buyer declares, execute_change refused, and the vendor call delegated to the transport
// THEY implement — because they hold the account, not us.
//
// Every failure throws a stable `custom-browser-agent_*` code. Those codes are the contract with a
// buyer's integration team, so they are worth reading as a set in the kit.

import { createRemoteBrowserSessionFactory, describeRemoteAdapter } from './remote-adapter-kit.ts'
import type {
  RemoteAdapterConfiguration,
  RemoteAdapterCredentialBroker,
  RemoteAdapterDefinition,
  RemoteAdapterTransport,
} from './remote-adapter-kit.ts'
import type { BrowserSessionFactory } from '../browser-task-contracts.ts'

export const CUSTOM_ADAPTER_ID = 'custom-browser-agent'

export const CUSTOM_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: CUSTOM_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['endpoint', 'adapterModule']),
  credentialOptional: true,
})

export interface CustomAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ endpoint: string; adapterModule: string }>
}

export type CustomCredentialBroker = RemoteAdapterCredentialBroker
export type CustomTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const customAdapterStatus = describeRemoteAdapter(CUSTOM_ADAPTER_DEFINITION)

export function createCustomSessionFactory(
  configuration: CustomAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(CUSTOM_ADAPTER_DEFINITION, configuration)
}

export interface CustomAdapterFactory {
  create(configuration: CustomAdapterConfiguration): BrowserSessionFactory
}

export const customAdapterFactory: CustomAdapterFactory = Object.freeze({
  create: createCustomSessionFactory,
})

/**
 * Shape check for a configuration object before it reaches the factory.
 *
 * Kept because callers already import it, but no longer the near-useless `typeof value ===
 * 'object'` it used to be: it now checks the keys this vendor actually requires. It is a
 * pre-flight for a form, not a substitute for the factory — the factory is what refuses.
 */
export function validateCustomAdapterConfiguration(value: unknown): value is CustomAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { configuration?: Record<string, unknown> }
  if (!candidate.configuration || typeof candidate.configuration !== 'object') return false
  return CUSTOM_ADAPTER_DEFINITION.requiredConfigurationKeys.every(
    key => typeof candidate.configuration?.[key] === 'string' && String(candidate.configuration[key]).trim().length > 0,
  )
}
