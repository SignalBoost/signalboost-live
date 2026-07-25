// saas/agent-gateway/mcp-server.ts
//
// THE SOCKET YOU CAN ACTUALLY PLUG INTO. Everything else in agent-gateway/ is the spine;
// this is the port on the front panel. A buyer points Copilot, Agentforce, Claude, an
// in-house LangChain agent — anything that speaks MCP — at one endpoint, and every tool
// call that arrives is routed through the same two governance gates before anything runs.
//
// Deliberately NOT an HTTP server. This is a pure message handler: JSON-RPC 2.0 in,
// JSON-RPC 2.0 out. No Next.js, no Express, no framework, no environment, no credentials,
// no network. The buyer mounts it wherever they already terminate traffic — Lambda, Fastify,
// an API gateway, a service mesh sidecar — and keeps their own TLS, WAF, and identity.
//
// THE AUTHENTICATION BOUNDARY IS EXPLICIT AND ONE-WAY: this module never authenticates
// anybody. The caller's identity arrives already-verified in McpCallerContext, established
// by the buyer's own edge (their SSO, their mTLS, their token introspection). A portable
// that tried to authenticate would be forcing its opinion into the buyer's security stack;
// this one accepts theirs.
//
// HOW A HALT IS REPORTED (the subtle part): when governance parks an action for a human,
// the MCP reply is NOT an error. An error makes a calling agent retry, escalate, or invent
// a workaround — the exact behaviors a governed socket exists to prevent. A halt comes back
// as a successful call whose content plainly says the action is awaiting human approval,
// carrying the approval id, plus a machine-readable _governance block. The agent learns the
// truth and stops.

import type {
  AgentRequest,
  GatewayHost,
  GatewayOutcome,
  GovernancePolicy,
} from './types.ts'
import { runGoverned } from './governance.ts'

/** The MCP revision this server reports. Buyers' clients negotiate against it. */
export const MCP_PROTOCOL_VERSION = '2024-11-05'

// ---- JSON-RPC 2.0 ----
export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}
export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}
export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: JsonRpcError
}

export const JSON_RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const

/**
 * A tool the buyer chooses to expose. Declaring a tool here does NOT make it executable —
 * it still has to survive classification and the allowlist on every single call. This
 * catalog controls only what agents can SEE.
 */
export interface McpToolDefinition {
  name: string
  description: string
  /** JSON Schema for the tool's arguments, passed through to the client verbatim. */
  inputSchema: Record<string, unknown>
  /** The AgentAction.kind this tool maps to. Defaults to 'tool_call'. */
  actionKind?: string
}

/** Caller identity, already verified by the buyer's edge before it reaches this module. */
export interface McpCallerContext {
  agentId: string
  tenantId?: string
  actor?: { userId?: string; roles?: string[] }
  /** Optional idempotency/correlation id from the buyer's edge; one is derived if absent. */
  requestId?: string
}

export interface McpServerOptions {
  serverName: string
  serverVersion: string
  tools: readonly McpToolDefinition[]
  policy: GovernancePolicy
  host: GatewayHost
}

export interface McpServer {
  /**
   * Handle one JSON-RPC message. Returns null for notifications (messages with no id),
   * which by spec receive no reply.
   */
  handle(message: unknown, caller: McpCallerContext): Promise<JsonRpcResponse | null>
  /** The tool catalog as advertised to clients. */
  listTools(): readonly McpToolDefinition[]
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}
function fail(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Render a governed outcome as an MCP tools/call result. Never throws. */
export function outcomeToToolResult(outcome: GatewayOutcome): Record<string, unknown> {
  const governance = {
    verdict: outcome.verdict,
    consequenceClass: outcome.consequenceClass,
    reason: outcome.reason,
    ...(outcome.approvalId ? { approvalId: outcome.approvalId } : {}),
  }

  if (outcome.verdict === 'execute' && outcome.ok) {
    const text = typeof outcome.result === 'string' ? outcome.result : JSON.stringify(outcome.result ?? null)
    return { content: [{ type: 'text', text }], isError: false, _governance: governance }
  }

  if (outcome.verdict === 'execute' && !outcome.ok) {
    // A genuine execution failure IS an error — the action was permitted and broke.
    return {
      content: [{ type: 'text', text: `Execution failed: ${outcome.error ?? 'unknown error'}` }],
      isError: true,
      _governance: governance,
    }
  }

  if (outcome.verdict === 'halt_for_approval') {
    // Not an error: a correct, expected governance outcome. Say so unambiguously so the
    // calling agent stops rather than retrying or routing around the gate.
    const idPart = outcome.approvalId ? ` Approval id: ${outcome.approvalId}.` : ''
    return {
      content: [{
        type: 'text',
        text:
          `HALTED FOR HUMAN APPROVAL. This action was classified '${outcome.consequenceClass}', ` +
          `which always requires a person to approve it. It has NOT been performed and will not ` +
          `run until a human approves it.${idPart} Do not retry and do not attempt an alternative ` +
          `route to the same effect. Reason: ${outcome.reason}`,
      }],
      isError: false,
      _governance: governance,
    }
  }

  return {
    content: [{ type: 'text', text: `DENIED. ${outcome.reason} This action was not performed.` }],
    isError: true,
    _governance: governance,
  }
}

/**
 * Build an MCP server over the governed socket.
 *
 * Every tools/call becomes a normalized AgentRequest and goes through runGoverned(), so an
 * MCP client gets exactly the same verdict a MAVLink drone command or an A2A task would for
 * an equivalent action. That equivalence IS the product.
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  const byName = new Map(options.tools.map((t) => [t.name, t]))
  let counter = 0

  async function callTool(
    id: string | number | null,
    params: Record<string, unknown>,
    caller: McpCallerContext,
  ): Promise<JsonRpcResponse> {
    const name = typeof params.name === 'string' ? params.name : ''
    const tool = byName.get(name)
    // Fail closed: an undeclared tool never reaches governance, let alone execution.
    if (!tool) return fail(id, JSON_RPC.INVALID_PARAMS, `unknown tool: ${name || '(missing)'}`)

    const args = isPlainObject(params.arguments) ? params.arguments : {}
    const request: AgentRequest = {
      requestId: caller.requestId ?? `mcp_${Date.now().toString(36)}_${(++counter).toString(36)}`,
      protocol: 'mcp',
      agentId: caller.agentId,
      ...(caller.tenantId ? { tenantId: caller.tenantId } : {}),
      ...(caller.actor ? { actor: caller.actor } : {}),
      action: { kind: tool.actionKind ?? 'tool_call', target: tool.name, params: args },
      raw: params,
    }

    const outcome = await runGoverned(request, options.policy, options.host)
    return ok(id, outcomeToToolResult(outcome))
  }

  return {
    listTools: () => options.tools,

    async handle(message: unknown, caller: McpCallerContext): Promise<JsonRpcResponse | null> {
      if (!isPlainObject(message)) return fail(null, JSON_RPC.INVALID_REQUEST, 'message must be a JSON-RPC object')

      const id = (typeof message.id === 'string' || typeof message.id === 'number') ? message.id : null
      const isNotification = message.id === undefined
      const method = typeof message.method === 'string' ? message.method : ''

      if (message.jsonrpc !== '2.0') {
        return isNotification ? null : fail(id, JSON_RPC.INVALID_REQUEST, "jsonrpc must be '2.0'")
      }
      if (!method) {
        return isNotification ? null : fail(id, JSON_RPC.INVALID_REQUEST, 'method is required')
      }
      if (!caller || typeof caller.agentId !== 'string' || !caller.agentId) {
        // The buyer's edge failed to establish who is calling. Nothing runs anonymously.
        return isNotification ? null : fail(id, JSON_RPC.INVALID_REQUEST, 'caller identity is required')
      }

      const params = isPlainObject(message.params) ? message.params : {}

      try {
        switch (method) {
          case 'initialize':
            return ok(id, {
              protocolVersion: MCP_PROTOCOL_VERSION,
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: options.serverName, version: options.serverVersion },
            })

          case 'notifications/initialized':
          case 'notifications/cancelled':
            return null

          case 'ping':
            return isNotification ? null : ok(id, {})

          case 'tools/list':
            return ok(id, {
              tools: options.tools.map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
              })),
            })

          case 'tools/call':
            if (isNotification) return null
            return await callTool(id, params, caller)

          default:
            return isNotification ? null : fail(id, JSON_RPC.METHOD_NOT_FOUND, `unsupported method: ${method}`)
        }
      } catch (err) {
        // Never leak an internal shape to a caller; never crash the buyer's endpoint.
        const detail = err instanceof Error ? err.message : 'internal error'
        return isNotification ? null : fail(id, JSON_RPC.INTERNAL_ERROR, detail)
      }
    },
  }
}
