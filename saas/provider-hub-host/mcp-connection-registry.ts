import type { PortableCapabilityRisk } from '../provider-hub-core/capability-runtime.ts'
import { createMcpOutboundProviderHubAdapter, type McpRemoteToolMapping } from './mcp-outbound-adapter.ts'
import {
  createMcpOutboundClient,
  type McpOutboundScope,
  type McpOutboundTransport,
} from './mcp-outbound-client.ts'

export const MCP_CONNECTION_REGISTRY_VERSION = 'mcp-connection-registry-v1' as const

export interface McpRegisteredServer {
  serverId: string
  displayName: string
  transportRef: string
  enabled: boolean
  metadata?: Readonly<Record<string, string | number | boolean | null>>
}

export interface McpRegisteredToolMapping {
  remoteToolName: string
  capabilityId: string
  providerId: string
  connectionId: string
  risk: PortableCapabilityRisk
  requiresApproval: boolean
  scopes?: readonly string[]
  metadata?: Readonly<Record<string, string | number | boolean | null>>
}

export interface McpPortableServerAssignment {
  assignmentId: string
  serverId: string
  tenantId: string
  environmentId: string
  portableId: string
  enabled: boolean
  tools: readonly McpRegisteredToolMapping[]
}

export interface McpConnectionRegistrySnapshot {
  schemaVersion: typeof MCP_CONNECTION_REGISTRY_VERSION
  servers: readonly McpRegisteredServer[]
  assignments: readonly McpPortableServerAssignment[]
}

export interface McpConnectionRegistryPort {
  snapshot(): Promise<McpConnectionRegistrySnapshot>
}

export interface McpRegistryTransportFactory {
  create(input: {
    serverId: string
    transportRef: string
    scope: McpOutboundScope
  }): McpOutboundTransport
}

export interface McpRegistryResolution {
  assignmentId: string
  serverId: string
  transportRef: string
  adapter: ReturnType<typeof createMcpOutboundProviderHubAdapter>
}

const SECRET_KEY = /(?:secret|token|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|refresh[_-]?token|authorization|credential)/i

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`MCP registry ${name} is required`)
  if (normalized === '*') throw new Error(`MCP registry ${name} does not allow wildcard scope`)
  return normalized
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateSafeMetadata(value: unknown, path: string): void {
  if (value === undefined) return
  if (!plain(value)) throw new Error(`MCP registry ${path} must be a plain object`)
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new Error(`mcp_registry_secret_field_rejected:${path}.${key}`)
    if (item !== null && !['string', 'number', 'boolean'].includes(typeof item)) {
      throw new Error(`MCP registry ${path}.${key} must be scalar`)
    }
  }
}

function uniqueStrings(values: readonly string[] | undefined, name: string): readonly string[] {
  if (!values?.length) return Object.freeze([])
  const normalized = values.map(value => required(value, name))
  return Object.freeze([...new Set(normalized)])
}

function normalizeServer(server: McpRegisteredServer): McpRegisteredServer {
  validateSafeMetadata(server.metadata, 'server.metadata')
  return Object.freeze({
    serverId: required(server.serverId, 'serverId'),
    displayName: required(server.displayName, 'server.displayName'),
    transportRef: required(server.transportRef, 'server.transportRef'),
    enabled: server.enabled === true,
    metadata: server.metadata ? Object.freeze({ ...server.metadata }) : undefined,
  })
}

function normalizeTool(tool: McpRegisteredToolMapping): McpRegisteredToolMapping {
  validateSafeMetadata(tool.metadata, 'tool.metadata')
  if (!['read', 'write', 'consequential'].includes(tool.risk)) throw new Error('MCP registry tool.risk is invalid')
  if (tool.risk === 'consequential' && tool.requiresApproval !== true) {
    throw new Error('MCP registry consequential tool mappings must require approval')
  }
  return Object.freeze({
    remoteToolName: required(tool.remoteToolName, 'tool.remoteToolName'),
    capabilityId: required(tool.capabilityId, 'tool.capabilityId'),
    providerId: required(tool.providerId, 'tool.providerId'),
    connectionId: required(tool.connectionId, 'tool.connectionId'),
    risk: tool.risk,
    requiresApproval: tool.requiresApproval === true,
    scopes: uniqueStrings(tool.scopes, 'tool.scope'),
    metadata: tool.metadata ? Object.freeze({ ...tool.metadata }) : undefined,
  })
}

function normalizeAssignment(assignment: McpPortableServerAssignment): McpPortableServerAssignment {
  const tools = assignment.tools.map(normalizeTool)
  const remoteNames = new Set<string>()
  const capabilityIds = new Set<string>()
  for (const tool of tools) {
    if (remoteNames.has(tool.remoteToolName)) throw new Error(`mcp_registry_duplicate_remote_tool:${tool.remoteToolName}`)
    if (capabilityIds.has(tool.capabilityId)) throw new Error(`mcp_registry_duplicate_capability:${tool.capabilityId}`)
    remoteNames.add(tool.remoteToolName)
    capabilityIds.add(tool.capabilityId)
  }
  return Object.freeze({
    assignmentId: required(assignment.assignmentId, 'assignmentId'),
    serverId: required(assignment.serverId, 'assignment.serverId'),
    tenantId: required(assignment.tenantId, 'assignment.tenantId'),
    environmentId: required(assignment.environmentId, 'assignment.environmentId'),
    portableId: required(assignment.portableId, 'assignment.portableId'),
    enabled: assignment.enabled === true,
    tools: Object.freeze(tools),
  })
}

export function normalizeMcpConnectionRegistrySnapshot(input: Omit<McpConnectionRegistrySnapshot, 'schemaVersion'>): McpConnectionRegistrySnapshot {
  const servers = input.servers.map(normalizeServer)
  const assignments = input.assignments.map(normalizeAssignment)
  const serverIds = new Set<string>()
  const assignmentIds = new Set<string>()
  const scopeServerKeys = new Set<string>()

  for (const server of servers) {
    if (serverIds.has(server.serverId)) throw new Error(`mcp_registry_duplicate_server:${server.serverId}`)
    serverIds.add(server.serverId)
  }
  for (const assignment of assignments) {
    if (assignmentIds.has(assignment.assignmentId)) throw new Error(`mcp_registry_duplicate_assignment:${assignment.assignmentId}`)
    assignmentIds.add(assignment.assignmentId)
    if (!serverIds.has(assignment.serverId)) throw new Error(`mcp_registry_unknown_server:${assignment.serverId}`)
    const key = `${assignment.tenantId}\u0000${assignment.environmentId}\u0000${assignment.portableId}\u0000${assignment.serverId}`
    if (scopeServerKeys.has(key)) throw new Error(`mcp_registry_duplicate_scope_server_assignment:${assignment.assignmentId}`)
    scopeServerKeys.add(key)
  }

  return Object.freeze({
    schemaVersion: MCP_CONNECTION_REGISTRY_VERSION,
    servers: Object.freeze(servers),
    assignments: Object.freeze(assignments),
  })
}

export function createInMemoryMcpConnectionRegistry(input: Omit<McpConnectionRegistrySnapshot, 'schemaVersion'>): McpConnectionRegistryPort {
  const normalized = normalizeMcpConnectionRegistrySnapshot(input)
  return Object.freeze({ async snapshot() { return normalized } })
}

function mappingFor(tool: McpRegisteredToolMapping): McpRemoteToolMapping {
  return Object.freeze({
    capabilityId: tool.capabilityId,
    providerId: tool.providerId,
    connectionId: tool.connectionId,
    risk: tool.risk,
    requiresApproval: tool.requiresApproval,
    scopes: tool.scopes,
    metadata: Object.freeze({ registryVersion: MCP_CONNECTION_REGISTRY_VERSION, ...(tool.metadata ?? {}) }),
  })
}

export function createMcpConnectionRegistryResolver(options: {
  registry: McpConnectionRegistryPort
  transportFactory: McpRegistryTransportFactory
  timeoutMs?: number
  maxTools?: number
}) {
  async function resolve(input: {
    tenantId: string
    environmentId: string
    portableId: string
    serverId: string
    actor?: McpOutboundScope['actor']
  }): Promise<McpRegistryResolution | null> {
    const tenantId = required(input.tenantId, 'tenantId')
    const environmentId = required(input.environmentId, 'environmentId')
    const portableId = required(input.portableId, 'portableId')
    const serverId = required(input.serverId, 'serverId')
    const snapshot = await options.registry.snapshot()
    if (snapshot.schemaVersion !== MCP_CONNECTION_REGISTRY_VERSION) throw new Error('mcp_registry_schema_version_mismatch')

    const server = snapshot.servers.find(item => item.serverId === serverId && item.enabled)
    if (!server) return null
    const assignment = snapshot.assignments.find(item =>
      item.enabled && item.serverId === serverId && item.tenantId === tenantId &&
      item.environmentId === environmentId && item.portableId === portableId,
    )
    if (!assignment) return null

    const scope: McpOutboundScope = Object.freeze({ tenantId, environmentId, portableId, ...(input.actor ? { actor: input.actor } : {}) })
    const transport = options.transportFactory.create({ serverId, transportRef: server.transportRef, scope })
    const client = createMcpOutboundClient({ serverId, scope, transport, timeoutMs: options.timeoutMs, maxTools: options.maxTools })
    const byRemoteName = new Map(assignment.tools.map(tool => [tool.remoteToolName, tool] as const))
    const adapter = createMcpOutboundProviderHubAdapter({
      serverId,
      tenantId,
      environmentId,
      portableId,
      client,
      mapTool(remoteTool) {
        const registered = byRemoteName.get(remoteTool.name)
        return registered ? mappingFor(registered) : null
      },
    })

    return Object.freeze({ assignmentId: assignment.assignmentId, serverId, transportRef: server.transportRef, adapter })
  }

  async function listAssignments(input: { tenantId: string; environmentId: string; portableId: string }) {
    const tenantId = required(input.tenantId, 'tenantId')
    const environmentId = required(input.environmentId, 'environmentId')
    const portableId = required(input.portableId, 'portableId')
    const snapshot = await options.registry.snapshot()
    const enabledServers = new Set(snapshot.servers.filter(server => server.enabled).map(server => server.serverId))
    return Object.freeze(snapshot.assignments.filter(assignment =>
      assignment.enabled && enabledServers.has(assignment.serverId) && assignment.tenantId === tenantId &&
      assignment.environmentId === environmentId && assignment.portableId === portableId,
    ))
  }

  return Object.freeze({ resolve, listAssignments })
}
