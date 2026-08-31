import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { once } from 'node:events'
import { createInMemoryA2AAgentRegistry } from '../a2a-host/a2a-agent-registry.ts'
import { createA2AHttpJsonRpcTransportFactory, fetchA2AAgentCard } from '../a2a-host/a2a-http-jsonrpc-transport.ts'
import { runA2ALiveAcceptance } from '../a2a-host/a2a-live-acceptance.ts'

function registry(risk: 'advisory' | 'write' = 'advisory') {
  return createInMemoryA2AAgentRegistry({
    agents: [{
      agentId: 'marketing-agent',
      displayName: 'Buyer Marketing Agent',
      description: 'External buyer-owned marketing specialist',
      transportRef: 'buyer-marketing-primary',
      enabled: true,
      advertisedSkillIds: ['marketing.research'],
    }],
    assignments: [{
      assignmentId: 'assignment-live-1',
      agentId: 'marketing-agent',
      tenantId: 'buyer-a',
      environmentId: 'prod',
      portableId: 'portable-marketing',
      enabled: true,
      allowedSkills: [{ skillId: 'marketing.research', risk }],
    }],
  })
}

async function withRemoteServer(run: (baseUrl: string, evidence: { authSeen: boolean; sends: number }) => Promise<void>) {
  const evidence = { authSeen: false, sends: 0 }
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/.well-known/agent-card.json') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        protocolVersion: '0.3.0',
        name: 'External Marketing Specialist',
        description: 'Buyer-hosted A2A specialist',
        url: 'https://buyer.example/a2a',
        preferredTransport: 'JSONRPC',
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain'],
        skills: [{ id: 'marketing.research', name: 'Marketing research', description: 'Research marketing evidence', tags: ['marketing'] }],
      }))
      return
    }
    if (req.method === 'POST' && req.url === '/a2a') {
      evidence.authSeen = req.headers.authorization === 'Bearer runtime-only-secret'
      evidence.sends += 1
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const rpc = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: rpc.id,
        result: {
          kind: 'task',
          id: 'remote-task-1',
          contextId: 'remote-context-1',
          status: { state: 'completed' },
          artifacts: [{ artifactId: 'artifact-1', name: 'research', parts: [{ kind: 'text', text: 'PRIVATE REMOTE RESULT' }] }],
        },
      }))
      return
    }
    res.statusCode = 404
    res.end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  try { await run(baseUrl, evidence) } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
}

test('Phase 7 performs an end-to-end remote JSON-RPC delegation and emits secret-free acceptance evidence', async () => {
  await withRemoteServer(async (baseUrl, evidence) => {
    const transportFactory = createA2AHttpJsonRpcTransportFactory({
      allowInsecureLoopbackForTests: true,
      connectionResolver: {
        resolve(input) {
          assert.equal(input.transportRef, 'buyer-marketing-primary')
          assert.equal(input.scope.tenantId, 'buyer-a')
          return { endpoint: `${baseUrl}/a2a`, headers: { authorization: 'Bearer runtime-only-secret' } }
        },
      },
    })
    const record = await runA2ALiveAcceptance({
      registry: registry(),
      transportFactory,
      fetchAgentCard: () => fetchA2AAgentCard({ url: `${baseUrl}/.well-known/agent-card.json`, allowInsecureLoopbackForTests: true }),
      tenantId: 'buyer-a',
      environmentId: 'prod',
      portableId: 'portable-marketing',
      agentId: 'marketing-agent',
      familyId: 'marketing',
      skillId: 'marketing.research',
      messageId: 'acceptance-message-1',
      messageText: 'PRIVATE ACCEPTANCE PROMPT',
      traceId: 'acceptance-trace-1',
    })

    assert.equal(record.remoteObserved, true)
    assert.equal(record.mode, 'delegated')
    assert.equal(record.protocolVersion, '0.3.0')
    assert.equal(evidence.authSeen, true)
    assert.equal(evidence.sends, 1)
    const serialized = JSON.stringify(record)
    assert.ok(!serialized.includes(baseUrl))
    assert.ok(!serialized.includes('runtime-only-secret'))
    assert.ok(!serialized.includes('PRIVATE ACCEPTANCE PROMPT'))
    assert.ok(!serialized.includes('PRIVATE REMOTE RESULT'))
  })
})

test('Phase 7 production transport rejects insecure non-HTTPS endpoints before fetch', async () => {
  let called = false
  const factory = createA2AHttpJsonRpcTransportFactory({
    connectionResolver: { resolve: () => ({ endpoint: 'http://buyer.example/a2a' }) },
    fetchImpl: async () => { called = true; throw new Error('must not fetch') },
  })
  const transport = factory.create({
    agentId: 'marketing-agent',
    transportRef: 'buyer-marketing-primary',
    scope: { tenantId: 'buyer-a', environmentId: 'prod', portableId: 'portable-marketing' },
  })
  await assert.rejects(() => transport.send({
    agentId: 'marketing-agent',
    transportRef: 'buyer-marketing-primary',
    scope: { tenantId: 'buyer-a', environmentId: 'prod', portableId: 'portable-marketing' },
    request: { jsonrpc: '2.0', id: 1, method: 'message/send', params: {} },
    timeoutMs: 1000,
  }), /a2a_http_endpoint_must_be_https/)
  assert.equal(called, false)
})

test('Phase 7 live acceptance refuses non-advisory assignments before remote execution', async () => {
  let creates = 0
  const transportFactory = {
    create() {
      creates += 1
      return { async send() { throw new Error('must not send') } }
    },
  }
  await assert.rejects(() => runA2ALiveAcceptance({
    registry: registry('write'),
    transportFactory,
    fetchAgentCard: async () => ({
      protocolVersion: '0.3.0', name: 'External Marketing Specialist', description: 'Buyer-hosted', url: 'https://buyer.example/a2a', preferredTransport: 'JSONRPC',
      defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'],
      skills: [{ id: 'marketing.research', name: 'Marketing research', description: 'Research', tags: ['marketing'] }],
    }),
    tenantId: 'buyer-a', environmentId: 'prod', portableId: 'portable-marketing', agentId: 'marketing-agent', familyId: 'marketing',
    skillId: 'marketing.research', messageId: 'm', messageText: 'research', traceId: 't',
  }), /a2a_live_acceptance_advisory_only/)
  assert.equal(creates, 0)
})
