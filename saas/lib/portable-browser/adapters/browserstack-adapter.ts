// saas/lib/portable-browser/adapters/browserstack-adapter.ts
//
// BrowserStack Automate. The buyer transport connects to their hub with their username and access key.
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

export const BROWSERSTACK_ADAPTER_ID = 'browserstack'

export const BROWSERSTACK_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: BROWSERSTACK_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['hubEndpoint']),
})

export interface BrowserstackAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ hubEndpoint: string; projectName?: string }>
}

export type BrowserstackCredentialBroker = RemoteAdapterCredentialBroker
export type BrowserstackTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const browserstackAdapterStatus = describeRemoteAdapter(BROWSERSTACK_ADAPTER_DEFINITION)

export function createBrowserstackSessionFactory(
  configuration: BrowserstackAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(BROWSERSTACK_ADAPTER_DEFINITION, configuration)
}

export interface BrowserstackAdapterFactory {
  create(configuration: BrowserstackAdapterConfiguration): BrowserSessionFactory
}

export const browserstackAdapterFactory: BrowserstackAdapterFactory = Object.freeze({
  create: createBrowserstackSessionFactory,
})
