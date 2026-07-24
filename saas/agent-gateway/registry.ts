// saas/agent-gateway/registry.ts
//
// The protocol registry: N protocol adapters loaded CONCURRENTLY, all live at once. The
// enterprise's divisions can each speak a different protocol (MCP here, A2A there, a
// webhook elsewhere, protocol-X in 2028) and every one normalizes into the same internal
// request for the same governance core. Fail closed: an unknown protocol is refused, and
// a protocol can't be registered twice.

import type { AgentRequest, ProtocolAdapter } from './types.ts'

export class ProtocolRegistry {
  private readonly adapters = new Map<string, ProtocolAdapter>()

  register(adapter: ProtocolAdapter): void {
    if (this.adapters.has(adapter.protocolId)) {
      throw new Error(`protocol '${adapter.protocolId}' is already registered`)
    }
    this.adapters.set(adapter.protocolId, adapter)
  }

  list(): string[] {
    return [...this.adapters.keys()]
  }

  get(protocolId: string): ProtocolAdapter | undefined {
    return this.adapters.get(protocolId)
  }

  /** Normalize a raw request from a named protocol into the internal shape. Fail closed. */
  normalize(protocolId: string, raw: unknown): AgentRequest {
    const adapter = this.adapters.get(protocolId)
    if (!adapter) throw new Error(`no adapter registered for protocol '${protocolId}'`)
    return adapter.normalize(raw)
  }

  /** Format a governed outcome back into a protocol's wire format. */
  denormalize(protocolId: string, outcome: import('./types.ts').GatewayOutcome): unknown {
    const adapter = this.adapters.get(protocolId)
    if (!adapter) throw new Error(`no adapter registered for protocol '${protocolId}'`)
    return adapter.denormalize(outcome)
  }
}
