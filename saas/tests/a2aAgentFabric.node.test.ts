import assert from 'node:assert/strict'
import test from 'node:test'
import { A2A_PROTOCOL_VERSION, createA2AClient, validateA2AAgentCard, type A2ATransport } from '../a2a-core/a2a-client.ts'
import { createA2AAgentResolver, createInMemoryA2AAgentRegistry } from '../a2a-host/a2a-agent-registry.ts'

const tenantId = 'tenant-a'
const environmentId = 'prod'
const portableId = 'portable-marketing'
const agentId = 'marketing-specialist'
const transportRef = 'buyer-a2a-marketing'

function rpc(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function transport(handler: (request: Record<string, any>) => unknown): A2ATransport {
  return {
    async send(input) {
      assert.equal(input.agentId, agentId)
      assert.equal(input.transportRef, transportRef)
      assert.equal(input.scope.tenantId, tenantId)
      assert.equal(input.scope.environmentId, environmentId)
      assert.equal(input.scope.portableId, portableId)
      return handler(input.request as Record<string, any>)
    },
  }
}

function standardTransport(): A2ATransport {
  return transport(request => rpc(request.id, {
    kind: 'task',
    id: 'task-1',
    contextId: 'ctx-1',
    status: { state: 'completed' },
    artifacts: [{ artifactId: 'artifact-1', name: 'recommendation', parts: [{ kind: 'text', text: 'recommendation' }] }],
  }))
}

test('A2A Agent Card validator accepts 0.3 cards and rejects unsafe protocol/url variants', () => {
  const card = validateA2AAgentCard({
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: 'Marketing Specialist',
    description: 'Advisory marketing specialist',
    url: 'https://buyer.example/a2a/marketing',
    preferredTransport: 'JSONRPC',
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [{ id: 'campaign.analyze', name: 'Analyze campaign', description: 'Analyze campaign evidence', tags: ['marketing'] }],
  })
  assert.equal(card.protocolVersion, '0.3.0')
  assert.equal(card.skills[0]?.id, 'campaign.analyze')
  assert.throws(() => validateA2AAgentCard({ ...card, protocolVersion: '0.2.6' }), /a2a_protocol_version_unsupported/)
  assert.throws(() => validateA2AAgentCard({ ...card, url: 'http:\/\/buyer.example\/a2a' }), /a2a_agent_card_url_must_be_https/)
})

test('A2A client enforces JSON-RPC response correlation and preserves remote errors', async () => {
  const wrongId = createA2AClient({
    agentId,
    transportRef,
    scope: { tenantId, environmentId, portableId },
    transport: transport(request => rpc(Number(request.id) + 1, { kind: 'message', role: 'agent', messageId: 'm2', parts: [] })),
  })
  await assert.rejects(() => wrongId.sendMessage({ messageId: 'm1', text: 'hello' }), /a2a_response_id_mismatch/)

  const remoteError = createA2AClient({
    agentId,
    transportRef,
    scope: { tenantId, environmentId, portableId },
    transport: transport(request => ({ jsonrpc: '2.0', id: request.id, error: { code: -32001, message: 'agent unavailable' } })),
  })
  await assert.rejects(() => remoteError.sendMessage({ messageId: 'm1', text: 'hello' }), /agent unavailable/)
})

test('A2A registry is exact-scope, deny-by-default, and rejects secret-shaped metadata', async () => {
  const registry = createInMemoryA2AAgentRegistry({
    agents: [{
      agentId,
      displayName: 'Marketing Specialist',
      description: 'Buyer-pluggable specialist',
      transportRef,
      enabled: true,
      advertisedSkillIds: ['campaign.analyze', 'campaign.publish'],
    }],
    assignments: [{
      assignmentId: 'assignment-1',
      agentId,
      tenantId,
      environmentId,
      portableId,
      enabled: true,
      allowedSkills: [{ skillId: 'campaign.analyze', risk: 'advisory' }],
    }],
  })
  const resolver = createA2AAgentResolver({ registry, transportFactory: { create: () => standardTransport() } })
  assert.equal(await resolver.resolve({ tenantId: 'tenant-b', environmentId, portableId, agentId }), null)
  assert.equal(await resolver.resolve({ tenantId, environmentId, portableId: 'portable-sales', agentId }), null)
  const resolved = await resolver.resolve({ tenantId, environmentId, portableId, agentId })
  assert.deepEqual(resolved?.allowedSkillIds, ['campaign.analyze'])

  assert.throws(() => createInMemoryA2AAgentRegistry({
    agents: [{
      agentId,
      displayName: 'Bad',
      description: 'Bad',
      transportRef,
      enabled: true,
      advertisedSkillIds: ['campaign.analyze'],
      metadata: { apiToken: 'do-not-store' } as any,
    }],
    assignments: [],
  }), /a2a_registry_secret_field_rejected/)
})

test('Phase 1 permits advisory specialist delegation and blocks unapproved/non-advisory skills', async () => {
  let sends = 0
  const registry = createInMemoryA2AAgentRegistry({
    agents: [{
      agentId,
      displayName: 'Marketing Specialist',
      description: 'Buyer-pluggable specialist',
      transportRef,
      enabled: true,
      advertisedSkillIds: ['campaign.analyze', 'campaign.publish'],
    }],
    assignments: [{
      assignmentId: 'assignment-1',
      agentId,
      tenantId,
      environmentId,
      portableId,
      enabled: true,
      allowedSkills: [
        { skillId: 'campaign.analyze', risk: 'advisory' },
        { skillId: 'campaign.publish', risk: 'write' },
      ],
    }],
  })
  const wrapped: A2ATransport = {
    async send(input) {
      sends += 1
      return standardTransport().send(input)
    },
  }
  const resolver = createA2AAgentResolver({ registry, transportFactory: { create: () => wrapped } })
  const resolved = await resolver.resolve({ tenantId, environmentId, portableId, agentId })
  assert.ok(resolved)

  const result = await resolved.sendAdvisory({ skillId: 'campaign.analyze', messageId: 'msg-1', text: 'Analyze this campaign.' })
  assert.equal(result.kind, 'task')
  assert.equal(sends, 1)
  await assert.rejects(() => resolved.sendAdvisory({ skillId: 'campaign.publish', messageId: 'msg-2', text: 'Publish it.' }), /a2a_phase1_non_advisory_delegation_blocked/)
  await assert.rejects(() => resolved.sendAdvisory({ skillId: 'sales.close', messageId: 'msg-3', text: 'Close sale.' }), /a2a_skill_not_authorized/)
  assert.equal(sends, 1)
})

test('registry refuses assignments to skills the agent did not advertise', () => {
  assert.throws(() => createInMemoryA2AAgentRegistry({
    agents: [{
      agentId,
      displayName: 'Marketing Specialist',
      description: 'Buyer-pluggable specialist',
      transportRef,
      enabled: true,
      advertisedSkillIds: ['campaign.analyze'],
    }],
    assignments: [{
      assignmentId: 'assignment-1',
      agentId,
      tenantId,
      environmentId,
      portableId,
      enabled: true,
      allowedSkills: [{ skillId: 'campaign.publish', risk: 'write' }],
    }],
  }), /a2a_registry_unadvertised_skill/)
})
