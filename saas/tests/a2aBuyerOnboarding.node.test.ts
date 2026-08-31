import assert from 'node:assert/strict'
import test from 'node:test'
import { compileBuyerA2AOnboarding } from '../a2a-host/a2a-buyer-onboarding.ts'

function card(skills = ['marketing.research', 'marketing.publish']) {
  return {
    protocolVersion: '0.3.0',
    name: 'Buyer Marketing Specialist',
    description: 'Buyer-owned marketing specialist',
    url: 'https://buyer.example/a2a',
    preferredTransport: 'JSONRPC',
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['application/json'],
    skills: skills.map(id => ({ id, name: id, description: `Skill ${id}`, tags: ['buyer'] })),
  }
}

function input() {
  const agentCard = card()
  return {
    agentCard,
    fetchAgentCardForHealth: async () => agentCard,
    agentId: 'buyer-marketing-01',
    transportRef: 'buyer-host:marketing-primary',
    assignmentId: 'buyer-marketing-01:tenant-a:prod:portable-sales',
    tenantId: 'tenant-a',
    environmentId: 'prod',
    portableId: 'portable-sales',
    approvedSkills: [
      { skillId: 'marketing.research', risk: 'advisory' as const },
      { skillId: 'marketing.publish', risk: 'write' as const },
    ],
  }
}

test('Phase 11 compiles healthy buyer Agent Card plus explicit governance approvals into registry records', async () => {
  const result = await compileBuyerA2AOnboarding(input())
  assert.equal(result.status, 'buyer-ready')
  assert.equal(result.agent.enabled, true)
  assert.equal(result.assignment.enabled, true)
  assert.deepEqual(result.assignment.allowedSkills, [
    { skillId: 'marketing.research', risk: 'advisory' },
    { skillId: 'marketing.publish', risk: 'write' },
  ])
  assert.equal(result.health.length, 2)
  assert.ok(result.health.every(item => item.available))
})

test('Phase 11 refuses governance approval for a skill the buyer Agent Card does not advertise', async () => {
  const value = input()
  await assert.rejects(
    compileBuyerA2AOnboarding({ ...value, approvedSkills: [{ skillId: 'sales.crm.write', risk: 'write' }] }),
    /a2a_buyer_onboarding_unadvertised_skill:sales\.crm\.write/,
  )
})

test('Phase 11 rejects wildcard buyer scope', async () => {
  await assert.rejects(
    compileBuyerA2AOnboarding({ ...input(), tenantId: '*' }),
    /does not allow wildcard scope/,
  )
})

test('Phase 11 preserves governance-owned risk instead of inferring it from the remote card', async () => {
  const value = input()
  const result = await compileBuyerA2AOnboarding({
    ...value,
    approvedSkills: [{ skillId: 'marketing.publish', risk: 'consequential' }],
  })
  assert.equal(result.assignment.allowedSkills[0]?.risk, 'consequential')
})

test('Phase 11 fails closed when live health no longer advertises an approved skill', async () => {
  const value = input()
  await assert.rejects(
    compileBuyerA2AOnboarding({
      ...value,
      fetchAgentCardForHealth: async () => card(['marketing.research']),
    }),
    /a2a_buyer_onboarding_health_failed:marketing\.publish:a2a_availability_skill_missing/,
  )
})

test('Phase 11 compiled output contains no endpoint, credential, auth header, prompt, or response secret', async () => {
  const value = input()
  const result = await compileBuyerA2AOnboarding(value)
  const serialized = JSON.stringify(result)
  assert.ok(!serialized.includes('buyer.example'))
  assert.ok(!serialized.includes('Authorization'))
  assert.ok(!serialized.includes('Bearer'))
  assert.ok(!serialized.includes('prompt'))
  assert.ok(!serialized.includes('response'))
  assert.equal(result.agent.transportRef, 'buyer-host:marketing-primary')
})
