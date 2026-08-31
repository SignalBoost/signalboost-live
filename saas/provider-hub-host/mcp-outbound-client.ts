import { MCP_PROTOCOL_VERSION } from '../agent-gateway/mcp-server.ts'

export const PROVIDER_HUB_MCP_OUTBOUND_CLIENT_VERSION = 'provider-hub-mcp-outbound-client-v1' as const

export interface McpOutboundScope {
  tenantId: string
  environmentId: string
  portableId: string
  actor?: { userId?: string; roles?: readonly string[] }
}

export interface McpOutboundTransport {
  /**
   * Host-owned transport. It owns endpoint selection, TLS, authentication, proxying and
   * credential handling. The MCP client core receives none of those secrets.
   */
  send(input: {
    serverId: string
    request: Readonly<Record<string, unknown>>
    scope: McpOutboundScope
    timeoutMs: number
  }): Promise<unknown>
}

export interface McpRemoteTool {
  name: string
  description: string
  inputSchema: Readonly<Record<string, unknown>>
}

export interface McpOutboundClientOptions {
  serverId: string
  scope: McpOutboundScope
  transport: McpOutboundTransport
  timeoutMs?: number
  maxTools?: number
  clientName?: string
  clientVersion?: string
}

export interface McpOutboundClient {
  initialize(): Promise<{ protocolVersion: string; serverName?: string; serverVersion?: string }>
  listTools(): Promise<readonly McpRemoteTool[]>
  callTool(name: string, args: Readonly<Record<string, unknown>>): Promise<unknown>
}

type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code?: unknown; message?: unknown; data?: unknown }
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`MCP outbound ${name} is required`)
  return normalized
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isFinite(resolved) || resolved <= 0) throw new Error(`MCP outbound ${name} must be positive`)
  return Math.floor(resolved)
}

function parseResponse(raw: unknown, expectedId: number): JsonRpcResponse {
  if (!plain(raw) || raw.jsonrpc !== '2.0') throw new Error('mcp_invalid_jsonrpc_response')
  if (raw.id !== expectedId) throw new Error('mcp_response_id_mismatch')
  const hasResult = Object.prototype.hasOwnProperty.call(raw, 'result')
  const hasError = Object.prototype.hasOwnProperty.call(raw, 'error')
  if (hasResult === hasError) throw new Error('mcp_response_must_have_exactly_one_result_or_error')
  if (hasError && !plain(raw.error)) throw new Error('mcp_invalid_error_response')
  return raw as JsonRpcResponse
}

function remoteError(error: JsonRpcResponse['error']): Error {
  const code = typeof error?.code === 'number' ? error.code : 'unknown'
  const message = required(error?.message ?? 'remote MCP error', 'error.message')
  return new Error(`mcp_remote_error_${code}:${message}`)
}

function parseTool(value: unknown): McpRemoteTool {
  if (!plain(value)) throw new Error('mcp_invalid_tool_definition')
  const name = required(value.name, 'tool.name')
  const description = typeof value.description === 'string' ? value.description.trim() : ''
  if (!plain(value.inputSchema)) throw new Error(`mcp_tool_schema_required:${name}`)
  return Object.freeze({ name, description, inputSchema: Object.freeze({ ...value.inputSchema }) })
}

export function createMcpOutboundClient(options: McpOutboundClientOptions): McpOutboundClient {
  const serverId = required(options.serverId, 'serverId')
  const scope = Object.freeze({
    tenantId: required(options.scope.tenantId, 'scope.tenantId'),
    environmentId: required(options.scope.environmentId, 'scope.environmentId'),
    portableId: required(options.scope.portableId, 'scope.portableId'),
    ...(options.scope.actor ? { actor: Object.freeze({
      ...(options.scope.actor.userId ? { userId: required(options.scope.actor.userId, 'scope.actor.userId') } : {}),
      ...(options.scope.actor.roles ? { roles: Object.freeze(options.scope.actor.roles.map(role => required(role, 'scope.actor.role'))) } : {}),
    }) } : {}),
  })
  const timeoutMs = positiveInteger(options.timeoutMs, 15_000, 'timeoutMs')
  const maxTools = positiveInteger(options.maxTools, 128, 'maxTools')
  const clientName = required(options.clientName ?? 'signalboost-provider-hub', 'clientName')
  const clientVersion = required(options.clientVersion ?? PROVIDER_HUB_MCP_OUTBOUND_CLIENT_VERSION, 'clientVersion')
  let nextId = 0
  let initialized = false

  async function request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++nextId
    const raw = await options.transport.send({
      serverId,
      scope,
      timeoutMs,
      request: Object.freeze({
        jsonrpc: '2.0',
        id,
        method,
        ...(params ? { params: Object.freeze({ ...params }) } : {}),
      }),
    })
    const response = parseResponse(raw, id)
    if (response.error) throw remoteError(response.error)
    return response.result
  }

  async function initialize() {
    const result = await request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: clientName, version: clientVersion },
    })
    if (!plain(result)) throw new Error('mcp_invalid_initialize_result')
    const protocolVersion = required(result.protocolVersion, 'initialize.protocolVersion')
    if (protocolVersion !== MCP_PROTOCOL_VERSION) {
      throw new Error(`mcp_unsupported_protocol_version:${protocolVersion}`)
    }
    const serverInfo = plain(result.serverInfo) ? result.serverInfo : null
    initialized = true
    return Object.freeze({
      protocolVersion,
      ...(serverInfo && typeof serverInfo.name === 'string' ? { serverName: serverInfo.name.trim() } : {}),
      ...(serverInfo && typeof serverInfo.version === 'string' ? { serverVersion: serverInfo.version.trim() } : {}),
    })
  }

  async function ensureInitialized(): Promise<void> {
    if (!initialized) await initialize()
  }

  return Object.freeze({
    initialize,
    async listTools() {
      await ensureInitialized()
      const result = await request('tools/list')
      if (!plain(result) || !Array.isArray(result.tools)) throw new Error('mcp_invalid_tools_list')
      if (result.tools.length > maxTools) throw new Error(`mcp_tool_limit_exceeded:${result.tools.length}`)
      const seen = new Set<string>()
      const tools = result.tools.map(parseTool)
      for (const tool of tools) {
        if (seen.has(tool.name)) throw new Error(`mcp_duplicate_tool:${tool.name}`)
        seen.add(tool.name)
      }
      return Object.freeze(tools)
    },
    async callTool(name, args) {
      await ensureInitialized()
      const toolName = required(name, 'tool.name')
      if (!plain(args)) throw new Error('mcp_tool_arguments_must_be_object')
      return request('tools/call', { name: toolName, arguments: Object.freeze({ ...args }) })
    },
  })
}
