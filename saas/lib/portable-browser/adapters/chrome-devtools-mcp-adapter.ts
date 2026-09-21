// saas/lib/portable-browser/adapters/chrome-devtools-mcp-adapter.ts
//
// Chrome DevTools MCP is an MCP-first browser/debugger process. The portable never spawns it
// directly and never stores browser credentials. A buyer/host supplies the stdio transport
// behind a logical transportRef; this adapter keeps the existing browser-session governance
// boundary intact: exact adapter scope, exact origin allowlist, no execute_change by default,
// sanitized errors, and no implicit authority from the remote MCP server.
//
// The official Chrome DevTools MCP package uses stdio. Treating it as an arbitrary HTTP endpoint
// would create a false integration contract, so the host transport is explicit instead.

import { createRemoteBrowserSessionFactory, describeRemoteAdapter } from './remote-adapter-kit.ts'
import type {
  RemoteAdapterConfiguration,
  RemoteAdapterCredentialBroker,
  RemoteAdapterDefinition,
  RemoteAdapterTransport,
} from './remote-adapter-kit.ts'
import type { BrowserSessionFactory } from '../browser-task-contracts.ts'

export const CHROME_DEVTOOLS_MCP_ADAPTER_ID = 'chrome-devtools-mcp'

export const CHROME_DEVTOOLS_MCP_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: CHROME_DEVTOOLS_MCP_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['transportRef']),
  credentialOptional: true,
})

export interface ChromeDevtoolsMcpAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ transportRef: string }>
}

export type ChromeDevtoolsMcpCredentialBroker = RemoteAdapterCredentialBroker
export type ChromeDevtoolsMcpTransport = RemoteAdapterTransport

export const chromeDevtoolsMcpAdapterStatus = describeRemoteAdapter(CHROME_DEVTOOLS_MCP_ADAPTER_DEFINITION)

export function createChromeDevtoolsMcpSessionFactory(
  configuration: ChromeDevtoolsMcpAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(CHROME_DEVTOOLS_MCP_ADAPTER_DEFINITION, configuration)
}

export interface ChromeDevtoolsMcpAdapterFactory {
  create(configuration: ChromeDevtoolsMcpAdapterConfiguration): BrowserSessionFactory
}

export const chromeDevtoolsMcpAdapterFactory: ChromeDevtoolsMcpAdapterFactory = Object.freeze({
  create: createChromeDevtoolsMcpSessionFactory,
})

export function validateChromeDevtoolsMcpAdapterConfiguration(
  value: unknown,
): value is ChromeDevtoolsMcpAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { configuration?: Record<string, unknown> }
  if (!candidate.configuration || typeof candidate.configuration !== 'object') return false
  return CHROME_DEVTOOLS_MCP_ADAPTER_DEFINITION.requiredConfigurationKeys.every(
    key => typeof candidate.configuration?.[key] === 'string' && String(candidate.configuration[key]).trim().length > 0,
  )
}
