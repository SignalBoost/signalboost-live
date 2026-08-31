import assert from 'node:assert/strict'
import test from 'node:test'
import { probeA2AAvailability } from '../a2a-host/a2a-availability.ts'

function card(skills = ['self-healing.diagnose']) {
  return {
    protocolVersion: '0.3.0',
    name: 'Reference Diagnostic',
    description: 'Read-only diagnostic specialist',
    url: 'https://reference.example/a2a',
    preferredTransport: 'JSONRPC',
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['application/json'],
    skills: skills.map(id => ({ id, name: id, description: 'diagnostic', tags: ['reference'] })),
  }
}

test('Phase 10 reports available only when the validated card advertises the expected skill', async () => {
  const result = await probeA2AAvailability({ expectedSkillId: 'self-healing.diagnose', fetchAgentCard: async () => card() })
  assert.equal(result.available, true)
  assert.equal(result.protocolVersion, '0.3.0')
  assert.equal(result.skillId, 'self-healing.diagnose')
  assert.ok(result.latencyMs >= 0)
})

test('Phase 10 fails closed when the expected skill is absent', async () => {
  const result = await probeA2AAvailability({ expectedSkillId: 'self-healing.diagnose', fetchAgentCard: async () => card(['marketing.research']) })
  assert.equal(result.available, false)
  assert.equal(result.error, 'a2a_availability_skill_missing')
})

test('Phase 10 fails closed on malformed Agent Cards', async () => {
  const result = await probeA2AAvailability({ expectedSkillId: 'self-healing.diagnose', fetchAgentCard: async () => ({ protocolVersion: '0.3.0' }) })
  assert.equal(result.available, false)
  assert.match(result.error || '', /a2a_agent_card_skills_invalid|A2A/)
})

test('Phase 10 availability evidence cannot contain transport secrets or prompts', async () => {
  const secret = 'Bearer PRIVATE-TOKEN'
  const prompt = 'PRIVATE INCIDENT PROMPT'
  const result = await probeA2AAvailability({ expectedSkillId: 'self-healing.diagnose', fetchAgentCard: async () => card() })
  const serialized = JSON.stringify(result)
  assert.ok(!serialized.includes(secret))
  assert.ok(!serialized.includes(prompt))
  assert.ok(!serialized.includes('reference.example'))
})
