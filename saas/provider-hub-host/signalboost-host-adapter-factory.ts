import type { ProviderConfigStore } from '../lib/engine/providerConfigStore.ts'
import {
  composeProviderHubHostAdapter,
  PROVIDER_HUB_HOST_COMPOSITION_VERSION,
  type ProviderHubHostAdapter,
} from '../provider-hub-core/host-composition.ts'
import type {
  ProviderHubApprovalPort,
  ProviderHubAuditPort,
  ProviderHubIdentityPort,
  ProviderHubLicensingPort,
  ProviderHubUiPort,
  ProviderHubVaultPort,
} from '../provider-hub-core/host-ports.ts'
import {
  createSignalBoostProviderConnectionPort,
  type SignalBoostConnectionIdentityResolver,
} from './signalboost-provider-config-adapter.ts'

export const SIGNALBOOST_PROVIDER_HUB_HOST_FACTORY_VERSION = 'signalboost-provider-hub-host-factory-v1' as const
export const SIGNALBOOST_PROVIDER_HUB_HOST_ID = 'signalboost' as const

export interface SignalBoostProviderHubHostFactoryInput {
  tenantId: string
  environmentId: string
  store: Pick<ProviderConfigStore, 'getUserProviderConfig'>
  resolveUserId: SignalBoostConnectionIdentityResolver
  identity: ProviderHubIdentityPort
  vault: ProviderHubVaultPort
  audit: ProviderHubAuditPort
  approvals: ProviderHubApprovalPort
  licensing: ProviderHubLicensingPort
  ui: ProviderHubUiPort
}

export interface SignalBoostProviderHubHostFactoryResult {
  schemaVersion: typeof SIGNALBOOST_PROVIDER_HUB_HOST_FACTORY_VERSION
  compositionVersion: typeof PROVIDER_HUB_HOST_COMPOSITION_VERSION
  adapter: ProviderHubHostAdapter
  readOnly: true
  executable: false
}

function requiredDependency(value: unknown, name: string): void {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    throw new Error(`missing SignalBoost provider hub dependency: ${name}`)
  }
}

export function createSignalBoostProviderHubHostAdapter(
  input: SignalBoostProviderHubHostFactoryInput,
): SignalBoostProviderHubHostFactoryResult {
  requiredDependency(input.store, 'store')
  requiredDependency(input.resolveUserId, 'resolveUserId')
  requiredDependency(input.identity, 'identity')
  requiredDependency(input.vault, 'vault')
  requiredDependency(input.audit, 'audit')
  requiredDependency(input.approvals, 'approvals')
  requiredDependency(input.licensing, 'licensing')
  requiredDependency(input.ui, 'ui')

  const adapter = composeProviderHubHostAdapter({
    hostId: SIGNALBOOST_PROVIDER_HUB_HOST_ID,
    tenantId: input.tenantId,
    environmentId: input.environmentId,
    ports: {
      identity: input.identity,
      vault: input.vault,
      persistence: createSignalBoostProviderConnectionPort(input.store, input.resolveUserId),
      audit: input.audit,
      approvals: input.approvals,
      licensing: input.licensing,
      ui: input.ui,
    },
  })

  return Object.freeze({
    schemaVersion: SIGNALBOOST_PROVIDER_HUB_HOST_FACTORY_VERSION,
    compositionVersion: PROVIDER_HUB_HOST_COMPOSITION_VERSION,
    adapter,
    readOnly: true,
    executable: false,
  })
}
