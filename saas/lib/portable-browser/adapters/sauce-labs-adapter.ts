// saas/lib/portable-browser/adapters/sauce-labs-adapter.ts
//
// Sauce Labs. dataCentre is part of the configuration because it decides where the session physically runs.
//
// This was a four-line stub whose create() returned `never`. It now validates a buyer's
// configuration, resolves their credential from their vault per launch, enforces the origin
// allowlist, and delegates the vendor call to the transport THEY implement — the same shape
// browserbase and steel already use. See remote-adapter-kit.ts for the rules, including why
// approved origins are still sandbox-only across every adapter in this directory.

import { createRemoteBrowserSessionFactory, describeRemoteAdapter } from './remote-adapter-kit.ts'
import type {
  RemoteAdapterConfiguration,
  RemoteAdapterCredentialBroker,
  RemoteAdapterDefinition,
  RemoteAdapterTransport,
} from './remote-adapter-kit.ts'
import type { BrowserSessionFactory } from '../../browser-runtime/contracts.ts'

export const SAUCE_LABS_ADAPTER_ID = 'sauce-labs'

export const SAUCE_LABS_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: SAUCE_LABS_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['hubEndpoint', 'dataCentre']),
})

export interface SauceLabsAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ hubEndpoint: string; dataCentre: string }>
}

export type SauceLabsCredentialBroker = RemoteAdapterCredentialBroker
export type SauceLabsTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const sauceLabsAdapterStatus = describeRemoteAdapter(SAUCE_LABS_ADAPTER_DEFINITION)

export function createSauceLabsSessionFactory(
  configuration: SauceLabsAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(SAUCE_LABS_ADAPTER_DEFINITION, configuration)
}

export interface SauceLabsAdapterFactory {
  create(configuration: SauceLabsAdapterConfiguration): BrowserSessionFactory
}

export const sauceLabsAdapterFactory: SauceLabsAdapterFactory = Object.freeze({
  create: createSauceLabsSessionFactory,
})
