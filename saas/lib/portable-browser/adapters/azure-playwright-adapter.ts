// saas/lib/portable-browser/adapters/azure-playwright-adapter.ts
//
// Azure Playwright Testing. Workspace endpoint and region are both required — the region decides where the session runs, so it is configuration rather than a preference.
//
// WAS A FOUR-LINE STUB whose create() returned `never` and whose status published
// `requiredPorts: []` — a declaration that a buyer needed nothing, which was false and
// unhelpful in the same breath. It now runs on remote-adapter-kit.ts, the audited path every
// remote vendor here shares: configuration validated against this vendor's catalog contract, a
// credential resolved from the buyer's vault PER LAUNCH and never retained, an origin allowlist
// the buyer declares, execute_change refused, and the vendor call delegated to the transport
// THEY implement — because they hold the account, not us.
//
// Every failure throws a stable `azure-playwright_*` code. Those codes are the contract with a
// buyer's integration team, so they are worth reading as a set in the kit.

import { createRemoteBrowserSessionFactory, describeRemoteAdapter } from './remote-adapter-kit.ts'
import type {
  RemoteAdapterConfiguration,
  RemoteAdapterCredentialBroker,
  RemoteAdapterDefinition,
  RemoteAdapterTransport,
} from './remote-adapter-kit.ts'
import type { BrowserSessionFactory } from '../browser-task-contracts.ts'

export const AZURE_PLAYWRIGHT_ADAPTER_ID = 'azure-playwright'

export const AZURE_PLAYWRIGHT_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: AZURE_PLAYWRIGHT_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['workspaceEndpoint', 'region']),
})

export interface AzurePlaywrightAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ workspaceEndpoint: string; region: string }>
}

export type AzurePlaywrightCredentialBroker = RemoteAdapterCredentialBroker
export type AzurePlaywrightTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const azure_playwrightAdapterStatus = describeRemoteAdapter(AZURE_PLAYWRIGHT_ADAPTER_DEFINITION)

export function createAzurePlaywrightSessionFactory(
  configuration: AzurePlaywrightAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(AZURE_PLAYWRIGHT_ADAPTER_DEFINITION, configuration)
}

export interface AzurePlaywrightAdapterFactory {
  create(configuration: AzurePlaywrightAdapterConfiguration): BrowserSessionFactory
}

export const azurePlaywrightAdapterFactory: AzurePlaywrightAdapterFactory = Object.freeze({
  create: createAzurePlaywrightSessionFactory,
})

/**
 * Shape check for a configuration object before it reaches the factory.
 *
 * Kept because callers already import it, but no longer the near-useless `typeof value ===
 * 'object'` it used to be: it now checks the keys this vendor actually requires. It is a
 * pre-flight for a form, not a substitute for the factory — the factory is what refuses.
 */
export function validateAzurePlaywrightAdapterConfiguration(value: unknown): value is AzurePlaywrightAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { configuration?: Record<string, unknown> }
  if (!candidate.configuration || typeof candidate.configuration !== 'object') return false
  return AZURE_PLAYWRIGHT_ADAPTER_DEFINITION.requiredConfigurationKeys.every(
    key => typeof candidate.configuration?.[key] === 'string' && String(candidate.configuration[key]).trim().length > 0,
  )
}
