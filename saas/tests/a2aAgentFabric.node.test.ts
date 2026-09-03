import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertAgentCard,
  createA2AClient,
  createA2ADelegationRuntime,
  createA2ARegistry,
  type A2AAgentCard,
  type A2AAgentRegistration,
  type A2ADelegationTransport,
} from '../a2a-host/a2a-agent-runtime.ts'
import { A2A_SPECIALIST_FAMILIES, getA2ASpecialistFamily } from '../a2a-host/a2a-specialist-catalog.ts'

const tenantId = 'tenant-a'
const environmentId = 'prod'
const portableId = 'portable-a'
const agentId = 'agent-a'

function card(overrides: Partial<A2AAgentCard> = {}): A2AAgentCard {
  return {
    protocolVersion: '0.3',
    name: 'Example specialist',
    description: 'Governed specialist worker',
    url: 'https://buyer.example.com/a2a',
    version: '1.0.0',
    capabilities: {},
    skills: [
      { id: 'campaign.analyze', name: 'Analyze campaign', description: 'Analyze campaign evidence.' },
      { id: 'campaign.write', name: 'Write campaign', description: 'Prepare campaign content.' },
      { id: 'campaign.spend', name: 'Spend campaign budget', description: 'Change paid campaign spend.' },
    ],
    ...overrides,
  }
}

function registration(overrides: Partial<A2AAgentRegistration> = {}): A2AAgentRegistration {
  return {
    tenantId,
    environmentId,
    portableId,
    agentId,
    card: card(),
    enabled: true,
    allowedSkills: [
      { skillId: 'campaign.analyze', risk: 'advisory' },
      { skillId: 'campaign.write', risk: 'write', approvalRequired: true },
      { skillId: 'campaign.spend', risk: 'consequential', approvalRequired: true },
    ],
    ...overrides,
  }
}

function standardTransport(): A2ADelegationTransport {
  return {
    async send() {
      return {
        jsonrpc: '2.0',
        id: 'response',
        result: {
          id: 'task-1',
          status: { state: 'completed' },
          artifacts: [{ parts: [{ kind: 'text', text: 'ok' }] }],
        },
      }
    },
  }
}

function phase2Registry() {
  const registry = createA2ARegistry()
  registry.register(registration())
  registry.assignSkill({ tenantId, environmentId, portableId, skillId: 'campaign.analyze', agentId })
  registry.assignSkill({ tenantId, environmentId, portableId, skillId: 'campaign.write', agentId })
  registry.assignSkill({ tenantId, environmentId, portableId, skillId: 'campaign.spend', agentId })
  return registry
}

test('A2A Agent Card validator accepts 0.3 cards and rejects unsafe protocol/url variants', () => {
  assert.equal(assertAgentCard(card()).protocolVersion, '0.3')
  assert.throws(() => assertAgentCard(card({ protocolVersion: '0.2' })), /a2a_agent_card_protocol_unsupported/)
  assert.throws(() => assertAgentCard(card({ url: 'http://buyer.example.com/a2a' })), /a2a_agent_card_url_insecure/)
  assert.throws(() => assertAgentCard(card({ url: 'https://127.0.0.1/a2a' })), /a2a_agent_card_url_private/)
})

test('A2A client enforces JSON-RPC response correlation and preserves remote errors', async () => {
  const client = createA2AClient({
    transport: {
      async send(request) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32000, message: 'blocked upstream' },
        }
      },
    },
  })
  const result = await client.sendMessage({
    taskId: 'task-1',
    messageId: 'message-1',
    text: 'hello',
    context: { tenantId, environmentId, portableId },
  })
  assert.equal(result.ok, false)
  assert.equal(result.error?.message, 'blocked upstream')

  const mismatched = createA2AClient({
    transport: { async send() { return { jsonrpc: '2.0', id: 'wrong', result: {} } } },
  })
  await assert.rejects(() => mismatched.sendMessage({
    taskId: 'task-2',
    messageId: 'message-2',
    text: 'hello',
    context: { tenantId, environmentId, portableId },
  }), /a2a_response_id_mismatch/)
})

test('A2A registry is exact-scope, deny-by-default, and rejects secret-shaped metadata', () => {
  const registry = createA2ARegistry()
  registry.register(registration())
  registry.assignSkill({ tenantId, environmentId, portableId, skillId: 'campaign.analyze', agentId })
  assert.equal(registry.resolve({ tenantId, environmentId, portableId, skillId: 'campaign.analyze' })?.agentId, agentId)
  assert.equal(registry.resolve({ tenantId, environmentId: 'dev', portableId, skillId: 'campaign.analyze' }), null)
  assert.equal(registry.resolve({ tenantId, environmentId, portableId: 'portable-b', skillId: 'campaign.analyze' }), null)
  assert.throws(() => registry.register(registration({ metadata: { apiKey: 'secret' } })), /a2a_registration_metadata_secret_forbidden/)
})

test('Phase 1 permits advisory specialist delegation and blocks unapproved/non-advisory skills', async () => {
  const registry = createA2ARegistry()
  registry.register(registration({
    allowedSkills: [
      { skillId: 'campaign.analyze', risk: 'advisory' },
      { skillId: 'campaign.write', risk: 'write' },
    ],
  }))
  registry.assignSkill({ tenantId, environmentId, portableId, skillId: 'campaign.analyze', agentId })
  registry.assignSkill({ tenantId, environmentId, portableId, skillId: 'campaign.write', agentId })

  let transportCalls = 0
  const runtime = createA2ADelegationRuntime({
    registry,
    transportFactory: {
      create() {
        transportCalls += 1
        return standardTransport()
      },
    },
  })

  const advisory = await runtime.invoke({
    tenantId,
    environmentId,
    portableId,
    agentId,
    skillId: 'campaign.analyze',
    messageId: 'message-1',
    text: 'Analyze this campaign.',
  })
  assert.equal(advisory.ok, true)
  assert.equal(advisory.risk, 'advisory')
  assert.equal(transportCalls, 1)

  const write = await runtime.invoke({
    tenantId,
    environmentId,
    portableId,
    agentId,
    skillId: 'campaign.write',
    messageId: 'message-2',
    text: 'Publish this campaign.',
  })
  assert.equal(write.ok, false)
  assert.equal(write.mode, 'approval_required')
  assert.equal(transportCalls, 1)
})

test('registry refuses assignments to skills the agent did not advertise', () => {
  const registry = createA2ARegistry()
  registry.register(registration())
  assert.throws(
    () => registry.assignSkill({ tenantId, environmentId, portableId, skillId: 'sales.crm-write', agentId }),
    /a2a_assignment_skill_not_advertised/,
  )
})

test('Phase 2 blocks write delegation before transport creation unless approval is present', async () => {
  const registry = phase2Registry()
  let transports = 0
  const runtime = createA2ADelegationRuntime({
    registry,
    transportFactory: { create() { transports += 1; return standardTransport() } },
  })
  const blocked = await runtime.invoke({
    tenantId,
    environmentId,
    portableId,
    agentId,
    skillId: 'campaign.write',
    messageId: 'message-3',
    text: 'Write campaign.',
  })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.mode, 'approval_required')
  assert.equal(transports, 0)
})

test('Phase 2 requires buyer audit for consequential delegation and records approved execution identity', async () => {
  const registry = phase2Registry()
  let transports = 0
  let audits = 0
  const events: any[] = []
  const runtime = createA2ADelegationRuntime({
    registry,
    transportFactory: { create() { transports += 1; return standardTransport() } },
    audit: async event => { audits += 1; events.push(event) },
  })

  const missingAuditRuntime = createA2ADelegationRuntime({
    registry,
    transportFactory: { create() { transports += 1; return standardTransport() } },
  })
  const denied = await missingAuditRuntime.invoke({
    tenantId,
    environmentId,
    portableId,
    agentId,
    skillId: 'campaign.spend',
    messageId: 'message-4',
    text: 'Spend budget.',
    approval: { approved: true, approvalId: 'approval-2' },
  })
  assert.equal(denied.ok, false)
  assert.equal(denied.mode, 'audit_required')

  const approved = await runtime.invoke({
    tenantId,
    environmentId,
    portableId,
    agentId,
    skillId: 'campaign.spend',
    messageId: 'message-5',
    text: 'Spend budget.',
    approval: { approved: true, approvalId: 'approval-3' },
    traceId: 'trace-1',
  })
  assert.equal(approved.ok, true)
  assert.equal(approved.risk, 'consequential')
  assert.equal(transports, 1)
  assert.equal(audits, 1)
  assert.deepEqual({
    tenantId: events[0]?.tenantId,
    environmentId: events[0]?.environmentId,
    portableId: events[0]?.portableId,
    agentId: events[0]?.agentId,
    skillId: events[0]?.skillId,
    risk: events[0]?.risk,
    approvalId: events[0]?.approvalId,
    traceId: events[0]?.traceId,
  }, { tenantId, environmentId, portableId, agentId, skillId: 'campaign.spend', risk: 'consequential', approvalId: 'approval-3', traceId: 'trace-1' })
})

test('Phase 2 preserves advisory execution and denies unauthorized skill without transport', async () => {
  let transports = 0
  const runtime = createA2ADelegationRuntime({
    registry: phase2Registry(),
    transportFactory: { create() { transports += 1; return standardTransport() } },
  })
  const advisory = await runtime.invoke({ tenantId, environmentId, portableId, agentId, skillId: 'campaign.analyze', messageId: 'm-a', text: 'Analyze campaign.' })
  assert.equal(advisory.ok, true)
  assert.equal(advisory.risk, 'advisory')
  const denied = await runtime.invoke({ tenantId, environmentId, portableId, agentId, skillId: 'sales.crm-write', messageId: 'm-b', text: 'Change CRM.' })
  assert.equal(denied.mode, 'skill_not_authorized')
  assert.equal(transports, 1)
})

test('specialist catalog defines Software, marketing, sales, and separated self-healing roles with explicit risk', () => {
  assert.equal(A2A_SPECIALIST_FAMILIES.length, 6)
  const software = getA2ASpecialistFamily('software')
  assert.match(software.purpose, /Broadly proficient/i)
  assert.equal(software.skills.find(skill => skill.skillId === 'software.analyze')?.risk, 'advisory')
  assert.equal(software.skills.find(skill => skill.skillId === 'software.build')?.risk, 'write')
  assert.equal(software.skills.find(skill => skill.skillId === 'software.repair')?.risk, 'write')
  assert.equal(software.skills.find(skill => skill.skillId === 'software.platform-repair')?.risk, 'write')
  assert.equal(software.skills.find(skill => skill.skillId === 'software.verify')?.risk, 'advisory')
  assert.equal(getA2ASpecialistFamily('marketing').skills.find(skill => skill.skillId === 'marketing.campaign-mutate')?.risk, 'consequential')
  assert.equal(getA2ASpecialistFamily('sales').skills.find(skill => skill.skillId === 'sales.crm-write')?.risk, 'write')
  assert.equal(getA2ASpecialistFamily('self-healing-diagnostic').skills.every(skill => skill.risk === 'advisory'), true)
  assert.equal(getA2ASpecialistFamily('self-healing-remediation').skills.every(skill => skill.risk === 'consequential'), true)
  assert.equal(getA2ASpecialistFamily('self-healing-verification').skills.every(skill => skill.risk === 'advisory'), true)
})
