import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { once } from 'node:events'
import { createInMemoryA2AAgentRegistry } from '../a2a-host/a2a-agent-registry.ts'
import { createA2AHttpJsonRpcTransportFactory, fetchA2AAgentCard } from '../a2a-host/a2a-http-jsonrpc-transport.ts'
import { runSpecialistMeshLiveFailoverAcceptance } from '../a2a-host/specialist-mesh-live-failover-acceptance.ts'

const scope = { tenantId: 'buyer-a', environmentId: 'prod', portableId: 'portable-marketing' }
const skillId = 'marketing.research'
const primaryAgentId = 'marketing-primary'
const fallbackAgentId = 'marketing-fallback'

function registry(risk: 'advisory' | 'write' = 'advisory') {
  return createInMemoryA2AAgentRegistry({
    agents: [
      {
        agentId: primaryAgentId, displayName: 'Buyer Marketing Primary', description: 'Buyer-owned specialist',
        transportRef: 'buyer-marketing-primary', enabled: true, advertisedSkillIds: [skillId],
        metadata: { meshCostScore: 5, meshLoadScore: 5, meshLatencyScore: 5, meshReliabilityScore: 99, meshQualityScore: 99 },
      },
      {
        agentId: fallbackAgentId, displayName: 'Buyer Marketing Fallback', description: 'Buyer-owned specialist',
        transportRef: 'buyer-marketing-fallback', enabled: true, advertisedSkillIds: [skillId],
        metadata: { meshCostScore: 30, meshLoadScore: 20, meshLatencyScore: 20, meshReliabilityScore: 98, meshQualityScore: 98 },
      },
    ],
    assignments: [primaryAgentId, fallbackAgentId].map(agentId => ({
      assignmentId: `assignment-${agentId}`, agentId, ...scope, enabled: true, allowedSkills: [{ skillId, risk }],
    })),
  })
}

function qualifications(shared = false) {
  return {
    async snapshot(input: { tenantId: string; environmentId: string; portableId: string; skillId: string; agentIds: readonly string[] }) {
      if (input.tenantId !== scope.tenantId || input.environmentId !== scope.environmentId || input.portableId !== scope.portableId || input.skillId !== skillId) return {}
      return Object.fromEntries(input.agentIds.map(agentId => [agentId, {
        qualified: true,
        evidenceRef: shared ? 'qualification://shared' : `qualification://${agentId}/${skillId}`,
      }]))
    },
  }
}

function card(name: string) {
  return {
    protocolVersion: '0.3.0', name, description: 'Buyer-hosted A2A specialist', url: 'https://buyer.example/a2a', preferredTransport: 'JSONRPC',
    defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'],
    skills: [{ id: skillId, name: 'Marketing research', description: 'Research marketing evidence', tags: ['marketing'] }],
  }
}

async function withTwoRemoteSpecialists(run: (input: {
  baseUrl: string
  evidence: { primarySends: number; fallbackSends: number; primaryAuthSeen: boolean; fallbackAuthSeen: boolean }
}) => Promise<void>) {
  const evidence = { primarySends: 0, fallbackSends: 0, primaryAuthSeen: false, fallbackAuthSeen: false }
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/primary/.well-known/agent-card.json') {
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(card('Primary Marketing Specialist'))); return
    }
    if (req.method === 'GET' && req.url === '/fallback/.well-known/agent-card.json') {
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(card('Fallback Marketing Specialist'))); return
    }
    if (req.method === 'POST' && req.url === '/primary/a2a') {
      evidence.primarySends += 1
      evidence.primaryAuthSeen = req.headers.authorization === 'Bearer primary-runtime-secret'
      for await (const _chunk of req) { /* consume request */ }
      res.statusCode = 503
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'temporary unavailable' }))
      return
    }
    if (req.method === 'POST' && req.url === '/fallback/a2a') {
      evidence.fallbackSends += 1
      evidence.fallbackAuthSeen = req.headers.authorization === 'Bearer fallback-runtime-secret'
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const rpc = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        jsonrpc: '2.0', id: rpc.id,
        result: {
          kind: 'task', id: 'fallback-task-1', contextId: 'fallback-context-1', status: { state: 'completed' },
          artifacts: [{ artifactId: 'artifact-1', name: 'research', parts: [{ kind: 'text', text: 'PRIVATE FALLBACK RESULT' }] }],
        },
      }))
      return
    }
    res.statusCode = 404; res.end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  try { await run({ baseUrl, evidence }) } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
}

function transportFactory(baseUrl: string) {
  return createA2AHttpJsonRpcTransportFactory({
    allowInsecureLoopbackForTests: true,
    connectionResolver: {
      resolve(input) {
        if (input.transportRef === 'buyer-marketing-primary') return { endpoint: `${baseUrl}/primary/a2a`, headers: { authorization: 'Bearer primary-runtime-secret' } }
        if (input.transportRef === 'buyer-marketing-fallback') return { endpoint: `${baseUrl}/fallback/a2a`, headers: { authorization: 'Bearer fallback-runtime-secret' } }
        throw new Error(`unexpected transport ref: ${input.transportRef}`)
      },
    },
  })
}

function acceptanceInput(baseUrl: string, overrides: Record<string, unknown> = {}) {
  return {
    registry: registry(), transportFactory: transportFactory(baseUrl), qualifications: qualifications(),
    primary: { agentId: primaryAgentId, fetchAgentCard: () => fetchA2AAgentCard({ url: `${baseUrl}/primary/.well-known/agent-card.json`, allowInsecureLoopbackForTests: true }) },
    fallback: { agentId: fallbackAgentId, fetchAgentCard: () => fetchA2AAgentCard({ url: `${baseUrl}/fallback/.well-known/agent-card.json`, allowInsecureLoopbackForTests: true }) },
    ...scope, familyId: 'marketing' as const, skillId, messageId: 'failover-message-1', messageText: 'PRIVATE FAILOVER ACCEPTANCE PROMPT', traceId: 'failover-trace-1',
    ...overrides,
  }
}

test('two independently qualified remote specialists prove bounded advisory failover without broadcast', async () => {
  await withTwoRemoteSpecialists(async ({ baseUrl, evidence }) => {
    const record = await runSpecialistMeshLiveFailoverAcceptance(acceptanceInput(baseUrl))
    assert.deepEqual(record.attemptedAgentIds, [primaryAgentId, fallbackAgentId])
    assert.equal(record.primaryMode, 'a2a_transport_unavailable')
    assert.equal(record.fallbackMode, 'delegated')
    assert.equal(record.bothTransportsAttempted, true)
    assert.equal(record.noBroadcastObserved, true)
    assert.notEqual(record.primaryQualificationEvidenceFingerprint, record.fallbackQualificationEvidenceFingerprint)
    assert.equal(evidence.primarySends, 1)
    assert.equal(evidence.fallbackSends, 1)
    assert.equal(evidence.primaryAuthSeen, true)
    assert.equal(evidence.fallbackAuthSeen, true)
    const serialized = JSON.stringify(record)
    assert.ok(!serialized.includes(baseUrl))
    assert.ok(!serialized.includes('runtime-secret'))
    assert.ok(!serialized.includes('qualification://'))
    assert.ok(!serialized.includes('PRIVATE FAILOVER ACCEPTANCE PROMPT'))
    assert.ok(!serialized.includes('PRIVATE FALLBACK RESULT'))
  })
})

test('shared qualification evidence cannot masquerade as two independent specialist qualifications', async () => {
  await withTwoRemoteSpecialists(async ({ baseUrl, evidence }) => {
    await assert.rejects(() => runSpecialistMeshLiveFailoverAcceptance(acceptanceInput(baseUrl, { qualifications: qualifications(true) })), /independent_qualification_evidence_required/)
    assert.equal(evidence.primarySends, 0)
    assert.equal(evidence.fallbackSends, 0)
  })
})

test('two-specialist acceptance refuses non-advisory work before any remote send', async () => {
  await withTwoRemoteSpecialists(async ({ baseUrl, evidence }) => {
    await assert.rejects(() => runSpecialistMeshLiveFailoverAcceptance(acceptanceInput(baseUrl, { registry: registry('write') })), /specialist_mesh_failover_advisory_only/)
    assert.equal(evidence.primarySends, 0)
    assert.equal(evidence.fallbackSends, 0)
  })
})

test('deterministic protocol/runtime errors do not fan out to the fallback specialist', async () => {
  let primarySends = 0
  let fallbackSends = 0
  const factory = {
    create(input: any) {
      return {
        async send(request: any) {
          if (input.agentId === primaryAgentId) {
            primarySends += 1
            return { jsonrpc: '2.0', id: `${request.request.id}-wrong`, result: { kind: 'message', messageId: 'bad', role: 'agent', parts: [{ kind: 'text', text: 'bad' }] } }
          }
          fallbackSends += 1
          throw new Error('fallback must not be called')
        },
      }
    },
  }
  await assert.rejects(() => runSpecialistMeshLiveFailoverAcceptance(acceptanceInput('http://127.0.0.1:1', {
    transportFactory: factory,
    primary: { agentId: primaryAgentId, fetchAgentCard: async () => card('Primary') },
    fallback: { agentId: fallbackAgentId, fetchAgentCard: async () => card('Fallback') },
  })), /specialist_mesh_failover_delegation_failed:a2a_runtime_error/)
  assert.equal(primarySends, 1)
  assert.equal(fallbackSends, 0)
})
