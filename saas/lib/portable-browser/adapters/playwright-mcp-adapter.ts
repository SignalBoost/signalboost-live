// saas/lib/portable-browser/adapters/playwright-mcp-adapter.ts
//
// Playwright MCP is stdio-first. The portable does not spawn the MCP process or install the
// package; a buyer/host supplies that transport behind a logical transportRef. The adapter keeps
// the browser governance contract identical to the other remote adapters: exact scope, exact
// origin allowlist, execute_change refused by default, per-launch credential resolution when a
// host needs it, and sanitized errors.
//
// The credential is OPTIONAL because a Playwright MCP process inside the buyer network commonly
// needs none. Requiring a credential where none exists would block the integration, not secure it.

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
  requiredConfigurationKeys: Object.freeze(['transportRef']),
  credentialOptional: true,
})

export interface PlaywrightMcpAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ transportRef: string }>
}

export type PlaywrightMcpCredentialBroker = RemoteAdapterCredentialBroker
export type PlaywrightMcpTransport = RemoteAdapterTransport

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

export function validatePlaywrightMcpAdapterConfiguration(value: unknown): value is PlaywrightMcpAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { configuration?: Record<string, unknown> }
  if (!candidate.configuration || typeof candidate.configuration !== 'object') return false
  return PLAYWRIGHT_MCP_ADAPTER_DEFINITION.requiredConfigurationKeys.every(
    key => typeof candidate.configuration?.[key] === 'string' && String(candidate.configuration[key]).trim().length > 0,
  )
}
