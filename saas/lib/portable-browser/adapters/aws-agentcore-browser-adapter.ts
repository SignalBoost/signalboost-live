// saas/lib/portable-browser/adapters/aws-agentcore-browser-adapter.ts
//
// AWS AgentCore Browser. Region is required because it decides where the session physically runs; an optional endpoint lets a buyer point at a PrivateLink address inside their own network.
//
// WAS A FOUR-LINE STUB whose create() returned `never` and whose status published
// `requiredPorts: []` — a declaration that a buyer needed nothing, which was false and
// unhelpful in the same breath. It now runs on remote-adapter-kit.ts, the audited path every
// remote vendor here shares: configuration validated against this vendor's catalog contract, a
// credential resolved from the buyer's vault PER LAUNCH and never retained, an origin allowlist
// the buyer declares, execute_change refused, and the vendor call delegated to the transport
// THEY implement — because they hold the account, not us.
//
// Every failure throws a stable `aws-agentcore-browser_*` code. Those codes are the contract with a
// buyer's integration team, so they are worth reading as a set in the kit.

import { createRemoteBrowserSessionFactory, describeRemoteAdapter } from './remote-adapter-kit.ts'
import type {
  RemoteAdapterConfiguration,
  RemoteAdapterCredentialBroker,
  RemoteAdapterDefinition,
  RemoteAdapterTransport,
} from './remote-adapter-kit.ts'
import type { BrowserSessionFactory } from '../browser-task-contracts.ts'

export const AWS_AGENTCORE_BROWSER_ADAPTER_ID = 'aws-agentcore-browser'

export const AWS_AGENTCORE_BROWSER_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: AWS_AGENTCORE_BROWSER_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['region']),
})

export interface AwsAgentcoreBrowserAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ region: string; endpoint?: string }>
}

export type AwsAgentcoreBrowserCredentialBroker = RemoteAdapterCredentialBroker
export type AwsAgentcoreBrowserTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const aws_agentcore_browserAdapterStatus = describeRemoteAdapter(AWS_AGENTCORE_BROWSER_ADAPTER_DEFINITION)

export function createAwsAgentcoreBrowserSessionFactory(
  configuration: AwsAgentcoreBrowserAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(AWS_AGENTCORE_BROWSER_ADAPTER_DEFINITION, configuration)
}

export interface AwsAgentcoreBrowserAdapterFactory {
  create(configuration: AwsAgentcoreBrowserAdapterConfiguration): BrowserSessionFactory
}

export const awsAgentcoreBrowserAdapterFactory: AwsAgentcoreBrowserAdapterFactory = Object.freeze({
  create: createAwsAgentcoreBrowserSessionFactory,
})

/**
 * Shape check for a configuration object before it reaches the factory.
 *
 * Kept because callers already import it, but no longer the near-useless `typeof value ===
 * 'object'` it used to be: it now checks the keys this vendor actually requires. It is a
 * pre-flight for a form, not a substitute for the factory — the factory is what refuses.
 */
export function validateAwsAgentcoreBrowserAdapterConfiguration(value: unknown): value is AwsAgentcoreBrowserAdapterConfiguration {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { configuration?: Record<string, unknown> }
  if (!candidate.configuration || typeof candidate.configuration !== 'object') return false
  return AWS_AGENTCORE_BROWSER_ADAPTER_DEFINITION.requiredConfigurationKeys.every(
    key => typeof candidate.configuration?.[key] === 'string' && String(candidate.configuration[key]).trim().length > 0,
  )
}
