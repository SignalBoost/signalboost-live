// saas/lib/portable-browser/adapters/lambdatest-adapter.ts
//
// LambdaTest grid.
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

export const LAMBDATEST_ADAPTER_ID = 'lambdatest'

export const LAMBDATEST_ADAPTER_DEFINITION: RemoteAdapterDefinition = Object.freeze({
  adapterId: LAMBDATEST_ADAPTER_ID,
  requiredConfigurationKeys: Object.freeze(['hubEndpoint']),
})

export interface LambdatestAdapterConfiguration extends RemoteAdapterConfiguration {
  configuration: Readonly<{ hubEndpoint: string }>
}

export type LambdatestCredentialBroker = RemoteAdapterCredentialBroker
export type LambdatestTransport = RemoteAdapterTransport

/** What a buyer still has to supply. Replaces the old `requiredPorts: []`. */
export const lambdatestAdapterStatus = describeRemoteAdapter(LAMBDATEST_ADAPTER_DEFINITION)

export function createLambdatestSessionFactory(
  configuration: LambdatestAdapterConfiguration,
): BrowserSessionFactory {
  return createRemoteBrowserSessionFactory(LAMBDATEST_ADAPTER_DEFINITION, configuration)
}

export interface LambdatestAdapterFactory {
  create(configuration: LambdatestAdapterConfiguration): BrowserSessionFactory
}

export const lambdatestAdapterFactory: LambdatestAdapterFactory = Object.freeze({
  create: createLambdatestSessionFactory,
})
