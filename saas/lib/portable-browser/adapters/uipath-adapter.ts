// saas/lib/portable-browser/adapters/uipath-adapter.ts
//
// UiPath Orchestrator. tenantName and folderPath are required so a run cannot escape an approved scope.
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
import type { BrowserSessionFactory } from '../browser-task-contracts.ts'

export const UIPATH_ADAPTER_ID = 'uipath'

export const UIPATH_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: UIPATH_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['orchestratorUrl', 'tenantName', 'folderPath']),
})

export interface UipathAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ orchestratorUrl: string; tenantName: string; folderPath: string }>
}

export type UipathCredentialBroker = RemoteAdapterCredentialBroker
export type UipathTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const uipathAdapterStatus = describeRemoteAdapter(UIPATH_ADAPTER_DEFINITION)

export function createUipathSessionFactory(
  configuration: UipathAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(UIPATH_ADAPTER_DEFINITION, configuration)
}

export interface UipathAdapterFactory {
  create(configuration: UipathAdapterConfiguration): BrowserSessionFactory
}

export const uipathAdapterFactory: UipathAdapterFactory = Object.freeze({
  create: createUipathSessionFactory,
})
