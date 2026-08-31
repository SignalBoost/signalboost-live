import {
  JSON_RPC,
  createMcpServer,
  type McpCallerContext,
  type McpServer,
  type McpToolDefinition,
} from '../agent-gateway/mcp-server.ts'
import type { GatewayHost, GovernancePolicy } from '../agent-gateway/types.ts'
import type {
  PortableCapabilityDescriptor,
  PortableCapabilityDiscoveryPort,
} from '../provider-hub-core/capability-runtime.ts'

export const PROVIDER_HUB_MCP_COMPATIBILITY_VERSION = 'provider-hub-mcp-compatibility-v1' as const

export interface ProviderHubMcpCompatibilityOptions {
  serverName?: string
  serverVersion?: string
  tenantId: string
  environmentId: string
  portableId: string
  discovery: PortableCapabilityDiscoveryPort
  policy: GovernancePolicy
  host: GatewayHost
  /**
   * MCP must advertise an explicit argument contract. A discovered capability without a
   * registered schema is deliberately omitted rather than exposed with an unbounded object.
   */
  inputSchemaFor(capability: PortableCapabilityDescriptor): Record<string, unknown> | null
  descriptionFor?(capability: PortableCapabilityDescriptor): string
}

export interface ProviderHubMcpCompatibilityServer extends McpServer {
  readonly tenantId: string
  readonly environmentId: string
  readonly portableId: string
  readonly compatibilityVersion: typeof PROVIDER_HUB_MCP_COMPATIBILITY_VERSION
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`Provider Hub MCP ${name} is required`)
  return normalized
}

function toolDescription(capability: PortableCapabilityDescriptor): string {
  const source = String(capability.metadata?.sourcePortable || '').trim()
  const provider = required(capability.providerId, 'capability.providerId')
  const origin = source ? ` from ${source}` : ''
  return `Read-only Provider Hub capability ${capability.capabilityId}${origin} via ${provider}.`
}

function exactReadCapabilities(
  capabilities: readonly PortableCapabilityDescriptor[],
  scope: { tenantId: string; environmentId: string },
): PortableCapabilityDescriptor[] {
  const seen = new Set<string>()
  const accepted: PortableCapabilityDescriptor[] = []

  for (const capability of capabilities) {
    if (capability.tenantId !== scope.tenantId || capability.environmentId !== scope.environmentId) continue
    if (capability.availability !== 'available') continue
    if (capability.risk !== 'read') continue
    if (capability.requiresApproval) continue
    if (seen.has(capability.capabilityId)) continue
    seen.add(capability.capabilityId)
    accepted.push(capability)
  }

  return accepted
}

/**
 * Project one exact portable's already-authorized Provider Hub read capabilities through the
 * existing Agent Gateway MCP socket. Discovery remains the authorization source: this layer never
 * invents a grant and never exposes write/consequential capabilities in Phase 1.
 */
export async function createProviderHubMcpCompatibilityServer(
  options: ProviderHubMcpCompatibilityOptions,
): Promise<ProviderHubMcpCompatibilityServer> {
  const tenantId = required(options.tenantId, 'tenantId')
  const environmentId = required(options.environmentId, 'environmentId')
  const portableId = required(options.portableId, 'portableId')

  const discovered = await options.discovery.discover({ tenantId, environmentId, portableId })
  const readable = exactReadCapabilities(discovered, { tenantId, environmentId })
  const tools: McpToolDefinition[] = []

  for (const capability of readable) {
    const inputSchema = options.inputSchemaFor(capability)
    if (!inputSchema) continue
    tools.push({
      name: capability.capabilityId,
      description: options.descriptionFor?.(capability) || toolDescription(capability),
      inputSchema,
      actionKind: 'tool_call',
    })
  }

  const inner = createMcpServer({
    serverName: options.serverName || `signalboost-provider-hub-${portableId}`,
    serverVersion: options.serverVersion || PROVIDER_HUB_MCP_COMPATIBILITY_VERSION,
    tools: Object.freeze(tools),
    policy: options.policy,
    host: options.host,
  })

  return Object.freeze({
    tenantId,
    environmentId,
    portableId,
    compatibilityVersion: PROVIDER_HUB_MCP_COMPATIBILITY_VERSION,
    listTools: inner.listTools,
    async handle(message: unknown, caller: McpCallerContext) {
      // The buyer/platform edge owns authentication, but this compatibility socket binds that
      // verified identity to the exact tenant for which the portable catalog was constructed.
      if (!caller?.actor?.userId) {
        const id = typeof (message as any)?.id === 'string' || typeof (message as any)?.id === 'number'
          ? (message as any).id
          : null
        return { jsonrpc: '2.0', id, error: { code: JSON_RPC.INVALID_REQUEST, message: 'verified actor.userId is required' } }
      }
      if (caller.tenantId !== tenantId) {
        const id = typeof (message as any)?.id === 'string' || typeof (message as any)?.id === 'number'
          ? (message as any).id
          : null
        return { jsonrpc: '2.0', id, error: { code: JSON_RPC.INVALID_REQUEST, message: 'caller tenant does not match MCP capability scope' } }
      }
      return inner.handle(message, caller)
    },
  })
}
