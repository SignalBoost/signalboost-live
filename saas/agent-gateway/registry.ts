// saas/agent-gateway/registry.ts
// Concurrent protocol registry. Unknown and duplicate protocols fail closed.

import type { AgentRequest, ProtocolAdapter, ProtocolCapabilityMetadata } from './types.ts'

export class ProtocolRegistry {
  private readonly adapters = new Map<string, ProtocolAdapter>()

  register(adapter: ProtocolAdapter): void {
    if (this.adapters.has(adapter.protocolId)) {
      throw new Error(`protocol '${adapter.protocolId}' is already registered`)
    }
    if (!adapter.capabilities.version || adapter.capabilities.operations.length === 0 || adapter.capabilities.evidence.length === 0) {
      throw new Error(`protocol '${adapter.protocolId}' has incomplete capability metadata`)
    }
    this.adapters.set(adapter.protocolId, adapter)
  }

  list(): string[] {
    return [...this.adapters.keys()]
  }

  get(protocolId: string): ProtocolAdapter | undefined {
    return this.adapters.get(protocolId)
  }

  capabilities(protocolId: string): ProtocolCapabilityMetadata {
    const adapter = this.adapters.get(protocolId)
    if (!adapter) throw new Error(`no adapter registered for protocol '${protocolId}'`)
    return adapter.capabilities
  }

  capabilityCatalog(): Readonly<Record<string, ProtocolCapabilityMetadata>> {
    return Object.freeze(Object.fromEntries([...this.adapters].map(([id, adapter]) => [id, adapter.capabilities])))
  }

  normalize(protocolId: string, raw: unknown): AgentRequest {
    const adapter = this.adapters.get(protocolId)
    if (!adapter) throw new Error(`no adapter registered for protocol '${protocolId}'`)
    return adapter.normalize(raw)
  }

  denormalize(protocolId: string, outcome: import('./types.ts').GatewayOutcome): unknown {
    const adapter = this.adapters.get(protocolId)
    if (!adapter) throw new Error(`no adapter registered for protocol '${protocolId}'`)
    return adapter.denormalize(outcome)
  }
}
