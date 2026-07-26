import { PROVIDER_HUB_HOST_PORTS_VERSION, type ProviderHubHostPorts } from './host-ports.ts'

export const PROVIDER_HUB_HOST_COMPOSITION_VERSION = 'provider-hub-host-composition-v1' as const

export interface ProviderHubHostAdapter {
  schemaVersion: typeof PROVIDER_HUB_HOST_COMPOSITION_VERSION
  hostId: string
  tenantId: string
  environmentId: string
  portsVersion: typeof PROVIDER_HUB_HOST_PORTS_VERSION
  ports: ProviderHubHostPorts
  readOnly: true
  executable: false
  automaticApprovalEnabled: false
  providerMutationEnabled: false
  browserExecutionEnabled: false
  infrastructureMutationEnabled: false
  productionExecutionEnabled: false
}

const REQUIRED_PORTS: readonly (keyof ProviderHubHostPorts)[] = Object.freeze([
  'identity',
  'vault',
  'persistence',
  'audit',
  'approvals',
  'licensing',
  'ui',
])

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/

function required(value: unknown, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!ID.test(normalized)) throw new Error(`invalid provider hub host ${field}`)
  return normalized
}

function validatePorts(ports: ProviderHubHostPorts): void {
  if (!ports || typeof ports !== 'object') throw new Error('provider hub host ports are required')
  for (const name of REQUIRED_PORTS) {
    const port = ports[name]
    if (!port || typeof port !== 'object') throw new Error(`missing provider hub host port: ${name}`)
  }
}

export function composeProviderHubHostAdapter(input: {
  hostId: unknown
  tenantId: unknown
  environmentId: unknown
  ports: ProviderHubHostPorts
}): ProviderHubHostAdapter {
  validatePorts(input.ports)

  return Object.freeze({
    schemaVersion: PROVIDER_HUB_HOST_COMPOSITION_VERSION,
    hostId: required(input.hostId, 'hostId'),
    tenantId: required(input.tenantId, 'tenantId'),
    environmentId: required(input.environmentId, 'environmentId'),
    portsVersion: PROVIDER_HUB_HOST_PORTS_VERSION,
    ports: Object.freeze({ ...input.ports }),
    readOnly: true,
    executable: false,
    automaticApprovalEnabled: false,
    providerMutationEnabled: false,
    browserExecutionEnabled: false,
    infrastructureMutationEnabled: false,
    productionExecutionEnabled: false,
  })
}

export class ProviderHubHostAdapterRegistry {
  private readonly adapters = new Map<string, ProviderHubHostAdapter>()

  register(adapter: ProviderHubHostAdapter): void {
    const key = this.key(adapter.hostId, adapter.tenantId, adapter.environmentId)
    if (this.adapters.has(key)) throw new Error('duplicate provider hub host adapter registration')
    this.adapters.set(key, adapter)
  }

  get(input: { hostId: string; tenantId: string; environmentId: string }): ProviderHubHostAdapter | null {
    return this.adapters.get(this.key(input.hostId, input.tenantId, input.environmentId)) ?? null
  }

  listByHost(hostIdInput: string): readonly ProviderHubHostAdapter[] {
    const hostId = required(hostIdInput, 'hostId')
    return Object.freeze([...this.adapters.values()]
      .filter(adapter => adapter.hostId === hostId)
      .sort((a, b) => a.tenantId.localeCompare(b.tenantId) || a.environmentId.localeCompare(b.environmentId)))
  }

  private key(hostIdInput: string, tenantIdInput: string, environmentIdInput: string): string {
    return `${required(hostIdInput, 'hostId')}::${required(tenantIdInput, 'tenantId')}::${required(environmentIdInput, 'environmentId')}`
  }
}
