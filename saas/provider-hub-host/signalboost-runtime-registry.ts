import type { SignalBoostProviderHubRuntimeAssembly } from './signalboost-runtime-assembly.ts'

export const SIGNALBOOST_PROVIDER_HUB_RUNTIME_REGISTRY_VERSION = 'signalboost-provider-hub-runtime-registry-v1' as const

export interface SignalBoostProviderHubRuntimeIdentity {
  hostId: string
  tenantId: string
  environmentId: string
}

export interface SignalBoostProviderHubRuntimeDescriptor extends SignalBoostProviderHubRuntimeIdentity {
  schemaVersion: typeof SIGNALBOOST_PROVIDER_HUB_RUNTIME_REGISTRY_VERSION
  runtimeSchemaVersion: SignalBoostProviderHubRuntimeAssembly['schemaVersion']
  portsVersion: SignalBoostProviderHubRuntimeAssembly['portsVersion']
  readOnly: true
  executable: false
  secretRetrievalEnabled: false
  providerMutationEnabled: false
  automaticApprovalEnabled: false
  browserExecutionEnabled: false
  infrastructureMutationEnabled: false
  productionExecutionEnabled: false
}

export interface SignalBoostProviderHubRuntimeRegistry {
  readonly schemaVersion: typeof SIGNALBOOST_PROVIDER_HUB_RUNTIME_REGISTRY_VERSION
  register(runtime: SignalBoostProviderHubRuntimeAssembly): SignalBoostProviderHubRuntimeDescriptor
  get(identity: SignalBoostProviderHubRuntimeIdentity): SignalBoostProviderHubRuntimeAssembly | null
  has(identity: SignalBoostProviderHubRuntimeIdentity): boolean
  list(): readonly SignalBoostProviderHubRuntimeDescriptor[]
}

function required(value: unknown, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`SignalBoost Provider Hub runtime registry ${field} is required`)
  return normalized
}

function normalizeIdentity(identity: SignalBoostProviderHubRuntimeIdentity): SignalBoostProviderHubRuntimeIdentity {
  return Object.freeze({
    hostId: required(identity.hostId, 'hostId'),
    tenantId: required(identity.tenantId, 'tenantId'),
    environmentId: required(identity.environmentId, 'environmentId'),
  })
}

function runtimeIdentity(runtime: SignalBoostProviderHubRuntimeAssembly): SignalBoostProviderHubRuntimeIdentity {
  if (!runtime || runtime.schemaVersion !== 'signalboost-provider-hub-runtime-assembly-v1') {
    throw new Error('SignalBoost Provider Hub runtime registry received an invalid runtime')
  }
  if (
    runtime.readOnly !== true ||
    runtime.executable !== false ||
    runtime.secretRetrievalEnabled !== false ||
    runtime.providerMutationEnabled !== false ||
    runtime.automaticApprovalEnabled !== false ||
    runtime.browserExecutionEnabled !== false ||
    runtime.infrastructureMutationEnabled !== false ||
    runtime.productionExecutionEnabled !== false
  ) {
    throw new Error('SignalBoost Provider Hub runtime registry rejected an unsafe runtime')
  }
  return normalizeIdentity({
    hostId: runtime.adapter.hostId,
    tenantId: runtime.adapter.tenantId,
    environmentId: runtime.adapter.environmentId,
  })
}

function key(identity: SignalBoostProviderHubRuntimeIdentity): string {
  const normalized = normalizeIdentity(identity)
  return `${normalized.hostId}\u0000${normalized.tenantId}\u0000${normalized.environmentId}`
}

function descriptor(runtime: SignalBoostProviderHubRuntimeAssembly): SignalBoostProviderHubRuntimeDescriptor {
  const identity = runtimeIdentity(runtime)
  return Object.freeze({
    schemaVersion: SIGNALBOOST_PROVIDER_HUB_RUNTIME_REGISTRY_VERSION,
    runtimeSchemaVersion: runtime.schemaVersion,
    portsVersion: runtime.portsVersion,
    ...identity,
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

export function createSignalBoostProviderHubRuntimeRegistry(): SignalBoostProviderHubRuntimeRegistry {
  const runtimes = new Map<string, SignalBoostProviderHubRuntimeAssembly>()
  const descriptors = new Map<string, SignalBoostProviderHubRuntimeDescriptor>()

  const registry: SignalBoostProviderHubRuntimeRegistry = {
    schemaVersion: SIGNALBOOST_PROVIDER_HUB_RUNTIME_REGISTRY_VERSION,
    register(runtime) {
      const identity = runtimeIdentity(runtime)
      const runtimeKey = key(identity)
      if (runtimes.has(runtimeKey)) {
        throw new Error(`SignalBoost Provider Hub runtime already registered: ${identity.hostId}/${identity.tenantId}/${identity.environmentId}`)
      }
      const publicDescriptor = descriptor(runtime)
      runtimes.set(runtimeKey, runtime)
      descriptors.set(runtimeKey, publicDescriptor)
      return publicDescriptor
    },
    get(identity) {
      return runtimes.get(key(identity)) ?? null
    },
    has(identity) {
      return runtimes.has(key(identity))
    },
    list() {
      return Object.freeze(
        [...descriptors.values()].sort((left, right) =>
          left.hostId.localeCompare(right.hostId) ||
          left.tenantId.localeCompare(right.tenantId) ||
          left.environmentId.localeCompare(right.environmentId),
        ),
      )
    },
  }

  return Object.freeze(registry)
}
