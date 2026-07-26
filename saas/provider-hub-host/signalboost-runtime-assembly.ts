import type { ProviderConfigStore } from '../lib/engine/providerConfigStore.ts'
import type { ProviderHubHostAdapter } from '../provider-hub-core/host-composition.ts'
import { createSignalBoostProviderHubHostAdapter } from './signalboost-host-adapter-factory.ts'
import {
  createSignalBoostReadonlyHostPorts,
  SIGNALBOOST_READONLY_HOST_PORTS_VERSION,
  type SignalBoostReadonlyHostPortDependencies,
} from './signalboost-readonly-host-ports.ts'
import type { SignalBoostConnectionIdentityResolver } from './signalboost-provider-config-adapter.ts'

export const SIGNALBOOST_PROVIDER_HUB_RUNTIME_ASSEMBLY_VERSION = 'signalboost-provider-hub-runtime-assembly-v1' as const

export interface SignalBoostProviderHubRuntimeAssemblyInput extends SignalBoostReadonlyHostPortDependencies {
  store: Pick<ProviderConfigStore, 'getUserProviderConfig'>
  resolveUserId: SignalBoostConnectionIdentityResolver
}

export interface SignalBoostProviderHubRuntimeAssembly {
  schemaVersion: typeof SIGNALBOOST_PROVIDER_HUB_RUNTIME_ASSEMBLY_VERSION
  portsVersion: typeof SIGNALBOOST_READONLY_HOST_PORTS_VERSION
  adapter: ProviderHubHostAdapter
  readOnly: true
  executable: false
  secretRetrievalEnabled: false
  providerMutationEnabled: false
  automaticApprovalEnabled: false
  browserExecutionEnabled: false
  infrastructureMutationEnabled: false
  productionExecutionEnabled: false
}

function requiredDependency(value: unknown, name: string): void {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    throw new Error(`missing SignalBoost provider hub runtime dependency: ${name}`)
  }
}

export function assembleSignalBoostProviderHubRuntime(
  input: SignalBoostProviderHubRuntimeAssemblyInput,
): SignalBoostProviderHubRuntimeAssembly {
  requiredDependency(input.store, 'store')
  requiredDependency(input.resolveUserId, 'resolveUserId')

  const ports = createSignalBoostReadonlyHostPorts(input)
  const factory = createSignalBoostProviderHubHostAdapter({
    tenantId: input.tenantId,
    environmentId: input.environmentId,
    store: input.store,
    resolveUserId: input.resolveUserId,
    identity: ports.identity,
    vault: ports.vault,
    audit: ports.audit,
    approvals: ports.approvals,
    licensing: ports.licensing,
    ui: ports.ui,
  })

  return Object.freeze({
    schemaVersion: SIGNALBOOST_PROVIDER_HUB_RUNTIME_ASSEMBLY_VERSION,
    portsVersion: SIGNALBOOST_READONLY_HOST_PORTS_VERSION,
    adapter: factory.adapter,
    readOnly: true,
    executable: false,
    secretRetrievalEnabled: false,
    providerMutationEnabled: false,
    automaticApprovalEnabled: false,
    browserExecutionEnabled: false,
    infrastructureMutationEnabled: false,
    productionExecutionEnabled: false,
  })
}
