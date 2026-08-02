// saas/lib/portable-browser/adapters/playwright-mcp-adapter.ts
//
// Playwright MCP. The credential is OPTIONAL because an MCP server inside the buyer network frequently needs none — and a required credential where none exists is a blocked integration, not a safer one.
//
// NEW ADAPTER. This vendor was in the catalog with no adapter file at all — a buyer could read
// its entry, see what it needs, and then find nothing to call. It runs on remote-adapter-kit.ts,
// the audited path every remote vendor here shares: configuration validated against this vendor's catalog contract, a
// credential resolved from the buyer's vault PER LAUNCH and never retained, an origin allowlist
// the buyer declares, execute_change refused, and the vendor call delegated to the transport
// THEY implement — because they hold the account, not us.
//
// Every failure throws a stable `playwright-mcp_*` code. Those codes are the contract with a
// buyer's integration team, so they are worth reading as a set in the kit.

import { createRemoteBrowserSessionFactory, describeRemoteAdapter } from './remote-adapter-kit.ts'
import type {
  RemoteAdapterConfiguration,
  RemoteAdapterCredentialBroker,
  RemoteAdapterDefinition,
  RemoteAdapterTransport,
} from './remote-adapter-kit.ts'
import type { BrowserSessionFactory } from '../browser-task-contracts.ts'

export const PLAYWRIGHT_MCP_ADAPTER_ID = 'playwright-mcp'

export const PLAYWRIGHT_MCP_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: PLAYWRIGHT_MCP_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['serverEndpoint']),
  credentialOptional: true,
})

export interface PlaywrightMcpAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ serverEndpoint: string }>
}

export type PlaywrightMcpCredentialBroker = RemoteAdapterCredentialBroker
export type PlaywrightMcpTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const playwrightMcpAdapterStatus = describeRemoteAdapter(PLAYWRIGHT_MCP_ADAPTER_DEFINITION)

export function createPlaywrightMcpSessionFactory(
  configuration: PlaywrightMcpAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(PLAYWRIGHT_MCP_ADAPTER_DEFINITION, configuration)
}

export interface PlaywrightMcpAdapterFactory {
  create(configuration: PlaywrightMcpAdapterConfiguration): BrowserSessionFactory
}

export const playwrightMcpAdapterFactory: PlaywrightMcpAdapterFactory = Object.freeze({
  create: createPlaywrightMcpSessionFactory,
})

/**
 * Shape check for a configuration object before it reaches the factory.
 *
 * Kept because callers already import it, but no longer the near-useless `typeof value ===
 * 'object'` it used to be: it now checks the keys this vendor actually requires. It is a
 * pre-flight for a form, not a substitute for the factory — the factory is what refuses.
 */
export function validatePlaywrightMcpAdapterConfiguration(value: unknown): value is PlaywrightMcpAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { configuration?: Record<string, unknown> }
  if (!candidate.configuration || typeof candidate.configuration !== 'object') return false
  return PLAYWRIGHT_MCP_ADAPTER_DEFINITION.requiredConfigurationKeys.every(
    key => typeof candidate.configuration?.[key] === 'string' && String(candidate.configuration[key]).trim().length > 0,
  )
}
