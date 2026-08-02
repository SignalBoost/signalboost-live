// saas/lib/portable-browser/adapters/selenium-grid-adapter.ts
//
// Selenium Grid, including a grid self-hosted inside the buyer network. Credential optional for the same reason as Playwright MCP: an internal grid often has none.
//
// NEW ADAPTER. This vendor was in the catalog with no adapter file at all — a buyer could read
// its entry, see what it needs, and then find nothing to call. It runs on remote-adapter-kit.ts,
// the audited path every remote vendor here shares: configuration validated against this vendor's catalog contract, a
// credential resolved from the buyer's vault PER LAUNCH and never retained, an origin allowlist
// the buyer declares, execute_change refused, and the vendor call delegated to the transport
// THEY implement — because they hold the account, not us.
//
// Every failure throws a stable `selenium-grid_*` code. Those codes are the contract with a
// buyer's integration team, so they are worth reading as a set in the kit.

import { createRemoteBrowserSessionFactory, describeRemoteAdapter } from './remote-adapter-kit.ts'
import type {
  RemoteAdapterConfiguration,
  RemoteAdapterCredentialBroker,
  RemoteAdapterDefinition,
  RemoteAdapterTransport,
} from './remote-adapter-kit.ts'
import type { BrowserSessionFactory } from '../browser-task-contracts.ts'

export const SELENIUM_GRID_ADAPTER_ID = 'selenium-grid'

export const SELENIUM_GRID_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: SELENIUM_GRID_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['hubEndpoint']),
  credentialOptional: true,
})

export interface SeleniumGridAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ hubEndpoint: string }>
}

export type SeleniumGridCredentialBroker = RemoteAdapterCredentialBroker
export type SeleniumGridTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const seleniumGridAdapterStatus = describeRemoteAdapter(SELENIUM_GRID_ADAPTER_DEFINITION)

export function createSeleniumGridSessionFactory(
  configuration: SeleniumGridAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(SELENIUM_GRID_ADAPTER_DEFINITION, configuration)
}

export interface SeleniumGridAdapterFactory {
  create(configuration: SeleniumGridAdapterConfiguration): BrowserSessionFactory
}

export const seleniumGridAdapterFactory: SeleniumGridAdapterFactory = Object.freeze({
  create: createSeleniumGridSessionFactory,
})

/**
 * Shape check for a configuration object before it reaches the factory.
 *
 * Kept because callers already import it, but no longer the near-useless `typeof value ===
 * 'object'` it used to be: it now checks the keys this vendor actually requires. It is a
 * pre-flight for a form, not a substitute for the factory — the factory is what refuses.
 */
export function validateSeleniumGridAdapterConfiguration(value: unknown): value is SeleniumGridAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { configuration?: Record<string, unknown> }
  if (!candidate.configuration || typeof candidate.configuration !== 'object') return false
  return SELENIUM_GRID_ADAPTER_DEFINITION.requiredConfigurationKeys.every(
    key => typeof candidate.configuration?.[key] === 'string' && String(candidate.configuration[key]).trim().length > 0,
  )
}
