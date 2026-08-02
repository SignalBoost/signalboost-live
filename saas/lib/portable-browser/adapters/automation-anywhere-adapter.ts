// saas/lib/portable-browser/adapters/automation-anywhere-adapter.ts
//
// Automation Anywhere Control Room. botId pins the workload rather than letting it be chosen at run time.
//
// This was a four-line stub whose create() returned `never`. It now validates a buyer's
// configuration, resolves their credential from their vault per launch, enforces the origin
// allowlist, and delegates the vendor call to the transport THEY implement — the same shape
// browserbase and steel already use. See remote-adapter-kit.ts for the rules, including why
// approved origins are declared by the BUYER: the allowlist must be non-empty, every entry an
// exact origin, and nothing outside it is reachable.

import { createRemoteBrowserSessionFactory, describeRemoteAdapter } from './remote-adapter-kit.ts'
import type {
  RemoteAdapterConfiguration,
  RemoteAdapterCredentialBroker,
  RemoteAdapterDefinition,
  RemoteAdapterTransport,
} from './remote-adapter-kit.ts'
import type { BrowserSessionFactory } from '../browser-task-contracts.ts'

export const AUTOMATION_ANYWHERE_ADAPTER_ID = 'automation-anywhere'

export const AUTOMATION_ANYWHERE_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: AUTOMATION_ANYWHERE_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['controlRoomUrl', 'botId']),
})

export interface AutomationAnywhereAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ controlRoomUrl: string; botId: string }>
}

export type AutomationAnywhereCredentialBroker = RemoteAdapterCredentialBroker
export type AutomationAnywhereTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const automationAnywhereAdapterStatus = describeRemoteAdapter(AUTOMATION_ANYWHERE_ADAPTER_DEFINITION)

export function createAutomationAnywhereSessionFactory(
  configuration: AutomationAnywhereAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(AUTOMATION_ANYWHERE_ADAPTER_DEFINITION, configuration)
}

export interface AutomationAnywhereAdapterFactory {
  create(configuration: AutomationAnywhereAdapterConfiguration): BrowserSessionFactory
}

export const automationAnywhereAdapterFactory: AutomationAnywhereAdapterFactory = Object.freeze({
  create: createAutomationAnywhereSessionFactory,
})
