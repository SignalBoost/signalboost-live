import test from 'node:test'
import assert from 'node:assert/strict'
import { runCOSSpecialistCrewMission } from '../lib/ai/cos/specialistCrewMission.ts'

const baseInput = {
  objective: 'Review whether the release is production-ready.',
  roles: ['software', 'security'] as const,
}

function advisory(overrides: Record<string, any> = {}) {
  return {
    ok: true,
    status: 'advisory_complete',
    framework: 'crewai' as const,
    mission_id: 'crew-test',
    roles: ['software', 'security'],
    report: 'Software and Security recommend holding until evidence is complete.',
    authority: {
      side_effects_allowed: false,
      approval_override_allowed: false,
      referee_override_allowed: false,
      persistent_memory_allowed: false,
    },
    memory: { scope: 'mission_ephemeral', durable_memory_used: false },
    trace: ['specialist:software', 'specialist:security', 'synthesis:crew-coordinator'],
    ...overrides,
  }
}

test('LangGraph verifies a bounded CrewAI advisory with the exact COS specialist roster', async () => {
  let calls = 0
  const result = await runCOSSpecialistCrewMission(
    { ...baseInput, roles: [...baseInput.roles] },
    { consult: async () => { calls += 1; return advisory() } },
  )

  assert.equal(result.status, 'verified')
  assert.equal(result.attempts, 1)
  assert.equal(calls, 1)
  assert.deepEqual(result.trace, ['plan', 'execute:1', 'verify:1:pass'])
})

test('LangGraph refuses CrewAI authority expansion and does not auto-retry', async () => {
  let calls = 0
  const result = await runCOSSpecialistCrewMission(
    { ...baseInput, roles: [...baseInput.roles] },
    {
      consult: async () => {
        calls += 1
        return advisory({
          authority: {
            side_effects_allowed: true,
            approval_override_allowed: false,
            referee_override_allowed: false,
            persistent_memory_allowed: false,
          },
        })
      },
    },
  )

  assert.equal(result.status, 'unverified')
  assert.equal(result.attempts, 1)
  assert.equal(calls, 1)
  assert.match(result.reason || '', /authority or memory boundary/)
})

test('LangGraph refuses a changed specialist roster', async () => {
  const result = await runCOSSpecialistCrewMission(
    { ...baseInput, roles: [...baseInput.roles] },
    { consult: async () => advisory({ roles: ['software', 'finance'] }) },
  )

  assert.equal(result.status, 'unverified')
  assert.match(result.reason || '', /different specialist roster/)
})

test('LangGraph preserves a failed CrewAI consultation as unverified evidence', async () => {
  const result = await runCOSSpecialistCrewMission(
    { ...baseInput, roles: [...baseInput.roles] },
    {
      consult: async () => ({
        ok: false,
        status: 'private_inference_unavailable',
        framework: 'crewai',
        error: 'private inference unavailable',
      }),
    },
  )

  assert.equal(result.status, 'unverified')
  assert.match(result.reason || '', /private_inference_unavailable/)
})
