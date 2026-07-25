// saas/tests/agentGatewayMcpServer.node.test.ts
//
// Proves the MCP endpoint is a governed socket and not a bypass: every tools/call goes
// through the same two gates, an undeclared tool never reaches governance, a halt is
// reported as a non-error so the calling agent stops instead of retrying, and nothing
// runs without a caller identity established by the buyer's edge.

import test from 'node:test'
import assert from 'node:assert/strict'

import { createMcpServer, MCP_PROTOCOL_VERSION, JSON_RPC } from '../agent-gateway/mcp-server.ts'
import { defaultConsequenceClassifier } from '../agent-gateway/classifier.ts'
import type { McpCallerContext, McpToolDefinition } from '../agent-gateway/mcp-server.ts'
import type { AgentRequest, GatewayHost, GovernancePolicy } from '../agent-gateway/types.ts'

const TOOLS: readonly McpToolDefinition[] = [
  { name: 'restart_worker', description: 'Restart a background worker', inputSchema: { type: 'object', properties: { worker: { type: 'string' } } } },
  { name: 'wireTransfer', description: 'Send a wire transfer', inputSchema: { type: 'object', properties: { amount_cents: { type: 'number' } } } },
  { name: 'send_email', description: 'Send an email', inputSchema: { type: 'object' } },
  { name: 'frobnicate', description: 'Does something nobody classified', inputSchema: { type: 'object' } },
]

const POLICY: GovernancePolicy = {
  classifier: defaultConsequenceClassifier,
  allowlist: [
    { actionKind: 'tool_call', target: 'restart_worker', rollback: 'restore previous worker generation' },
    // Allowlisted on purpose — Gate 1 must still stop it.
    { actionKind: 'tool_call', target: 'wireTransfer', rollback: 'reverse the wire' },
  ],
}

const CALLER: McpCallerContext = { agentId: 'copilot-1', tenantId: 't-1', actor: { userId: 'u-9' } }

function makeHost(): { host: GatewayHost; performed: AgentRequest[]; approvals: AgentRequest[] } {
  const performed: AgentRequest[] = []
  const approvals: AgentRequest[] = []
  const host: GatewayHost = {
    execution: {
      async perform(request) {
        performed.push(request)
        return { ok: true, result: `did ${request.action.target}` }
      },
    },
    approvals: {
      async requestApproval(request) {
        approvals.push(request)
        return { approvalId: `apr_${approvals.length}` }
      },
    },
  }
  return { host, performed, approvals }
}

function server(host: GatewayHost) {
  return createMcpServer({ serverName: 'governed-socket', serverVersion: '1.0.0', tools: TOOLS, policy: POLICY, host })
}

function call(name: string, args: Record<string, unknown> = {}, id: string | number = 1) {
  return { jsonrpc: '2.0' as const, id, method: 'tools/call', params: { name, arguments: args } }
}

test('initialize reports the protocol version and server identity', async () => {
  const { host } = makeHost()
  const res = await server(host).handle({ jsonrpc: '2.0', id: 1, method: 'initialize' }, CALLER)
  const result = res?.result as Record<string, unknown>
  assert.equal(result.protocolVersion, MCP_PROTOCOL_VERSION)
  assert.deepEqual(result.serverInfo, { name: 'governed-socket', version: '1.0.0' })
})

test('tools/list advertises exactly the buyer-declared catalog with its schemas', async () => {
  const { host } = makeHost()
  const res = await server(host).handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, CALLER)
  const tools = (res?.result as { tools: McpToolDefinition[] }).tools
  assert.deepEqual(tools.map((t) => t.name), ['restart_worker', 'wireTransfer', 'send_email', 'frobnicate'])
  assert.ok(tools[0].inputSchema, 'schemas are passed through to the client')
})

test('an allowlisted reversible tool call actually executes', async () => {
  const { host, performed } = makeHost()
  const res = await server(host).handle(call('restart_worker', { worker: 'render' }), CALLER)
  const result = res?.result as Record<string, unknown>
  assert.equal(result.isError, false)
  assert.equal((result._governance as Record<string, unknown>).verdict, 'execute')
  assert.equal(performed.length, 1)
  assert.equal(performed[0].protocol, 'mcp')
  assert.deepEqual(performed[0].action.params, { worker: 'render' })
})

test('GATE 1 THROUGH MCP: an allowlisted financial tool still halts and never executes', async () => {
  const { host, performed, approvals } = makeHost()
  const res = await server(host).handle(call('wireTransfer', { amount_cents: 250_000 }), CALLER)
  const result = res?.result as Record<string, unknown>
  const gov = result._governance as Record<string, unknown>
  assert.equal(gov.verdict, 'halt_for_approval')
  assert.equal(gov.consequenceClass, 'financial')
  assert.equal(performed.length, 0, 'the wire must NOT have been sent')
  assert.equal(approvals.length, 1, 'a human was asked')
})

test('a halt is reported as a NON-error so the calling agent stops instead of retrying', async () => {
  const { host } = makeHost()
  const res = await server(host).handle(call('send_email'), CALLER)
  const result = res?.result as Record<string, unknown>
  assert.equal(result.isError, false, 'a halt is a correct outcome, not a failure')
  const text = (result.content as Array<{ text: string }>)[0].text
  assert.match(text, /HALTED FOR HUMAN APPROVAL/)
  assert.match(text, /has NOT been performed/)
  assert.match(text, /Do not retry/)
  assert.match(text, /apr_1/, 'the approval id is surfaced to the agent')
})

test('an unclassified tool halts rather than running', async () => {
  const { host, performed } = makeHost()
  const res = await server(host).handle(call('frobnicate'), CALLER)
  const gov = (res?.result as Record<string, unknown>)._governance as Record<string, unknown>
  assert.equal(gov.consequenceClass, 'unknown')
  assert.equal(gov.verdict, 'halt_for_approval')
  assert.equal(performed.length, 0)
})

test('FAIL CLOSED: an undeclared tool is rejected before governance or execution', async () => {
  const { host, performed, approvals } = makeHost()
  const res = await server(host).handle(call('rm_rf_everything'), CALLER)
  assert.equal(res?.error?.code, JSON_RPC.INVALID_PARAMS)
  assert.match(res?.error?.message ?? '', /unknown tool/)
  assert.equal(performed.length, 0)
  assert.equal(approvals.length, 0, 'it never even became a governed request')
})

test('nothing runs anonymously — a missing caller identity is refused', async () => {
  const { host, performed } = makeHost()
  const res = await server(host).handle(call('restart_worker'), { agentId: '' } as McpCallerContext)
  assert.equal(res?.error?.code, JSON_RPC.INVALID_REQUEST)
  assert.match(res?.error?.message ?? '', /caller identity/)
  assert.equal(performed.length, 0)
})

test('malformed and unsupported messages are refused cleanly', async () => {
  const { host } = makeHost()
  const s = server(host)
  assert.equal((await s.handle('not an object', CALLER))?.error?.code, JSON_RPC.INVALID_REQUEST)
  assert.equal((await s.handle({ jsonrpc: '1.0', id: 1, method: 'tools/list' }, CALLER))?.error?.code, JSON_RPC.INVALID_REQUEST)
  assert.equal((await s.handle({ jsonrpc: '2.0', id: 1, method: 'resources/read' }, CALLER))?.error?.code, JSON_RPC.METHOD_NOT_FOUND)
})

test('notifications receive no reply, per JSON-RPC', async () => {
  const { host } = makeHost()
  const s = server(host)
  assert.equal(await s.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, CALLER), null)
  assert.equal(await s.handle({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'restart_worker' } }, CALLER), null)
})

test('a real execution failure IS an error — permitted but broken is different from halted', async () => {
  const failing: GatewayHost = { execution: { async perform() { return { ok: false, error: 'worker pool unreachable' } } } }
  const res = await server(failing).handle(call('restart_worker'), CALLER)
  const result = res?.result as Record<string, unknown>
  assert.equal(result.isError, true)
  assert.match((result.content as Array<{ text: string }>)[0].text, /worker pool unreachable/)
})

test('PORTABILITY: the same action gets the same verdict over MCP as it would anywhere', async () => {
  // The whole product claim in one assertion — the socket is protocol-blind.
  const { host } = makeHost()
  const res = await server(host).handle(call('wireTransfer', { amount_cents: 1 }), CALLER)
  const gov = (res?.result as Record<string, unknown>)._governance as Record<string, unknown>
  assert.equal(gov.consequenceClass, 'financial')
  assert.equal(gov.verdict, 'halt_for_approval')
})
