import test from 'node:test'
import assert from 'node:assert/strict'
import { consultSpecialistCrew } from '../lib/ai/cos/specialistCrewClient.ts'

function setCoordinatorUrl(value?: string) {
  if (value === undefined) delete process.env.COS_CREWAI_COORDINATOR_URL
  else process.env.COS_CREWAI_COORDINATOR_URL = value
}

test('CrewAI bridge fails closed when private coordinator is not configured', async () => {
  const previous = process.env.COS_CREWAI_COORDINATOR_URL
  setCoordinatorUrl(undefined)
  try {
    const result = await consultSpecialistCrew({ objective: 'Review the architecture', roles: ['architect'] })
    assert.equal(result.ok, false)
    assert.equal(result.status, 'private_inference_unavailable')
    assert.match(result.error || '', /No hosted fallback/)
  } finally {
    setCoordinatorUrl(previous)
  }
})

test('CrewAI bridge rejects a public coordinator endpoint', async () => {
  const previous = process.env.COS_CREWAI_COORDINATOR_URL
  setCoordinatorUrl('https://example.com')
  try {
    const result = await consultSpecialistCrew({ objective: 'Review the architecture', roles: ['architect'] })
    assert.equal(result.ok, false)
    assert.equal(result.status, 'private_inference_unavailable')
  } finally {
    setCoordinatorUrl(previous)
  }
})

test('CrewAI bridge rejects invented specialist roles before network execution', async () => {
  const previous = process.env.COS_CREWAI_COORDINATOR_URL
  setCoordinatorUrl('http://crew-coordinator:8000')
  let called = false
  try {
    await assert.rejects(
      () => consultSpecialistCrew(
        { objective: 'Review', roles: ['software-wizard' as any] },
        { fetchImpl: (async () => { called = true; throw new Error('should not call') }) as any },
      ),
      /Unsupported COS specialist role/,
    )
    assert.equal(called, false)
  } finally {
    setCoordinatorUrl(previous)
  }
})

test('CrewAI bridge sends analysis-only authority and accepts bounded advisory output', async () => {
  const previous = process.env.COS_CREWAI_COORDINATOR_URL
  setCoordinatorUrl('http://crew-coordinator:8000')
  let body: any = null
  const fakeFetch = async (_url: any, init: any) => {
    body = JSON.parse(init.body)
    return new Response(JSON.stringify({
      ok: true,
      status: 'advisory_complete',
      framework: 'crewai',
      mission_id: 'mission-1',
      roles: ['architect', 'ethics'],
      report: 'Advisory only.',
      authority: {
        side_effects_allowed: false,
        approval_override_allowed: false,
        referee_override_allowed: false,
        persistent_memory_allowed: false,
      },
      memory: { scope: 'mission_ephemeral', durable_memory_used: false },
      trace: ['specialist:architect', 'specialist:ethics', 'synthesis:crew-coordinator'],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const result = await consultSpecialistCrew(
      { objective: 'Review', roles: ['architect', 'ethics'] },
      { fetchImpl: fakeFetch as any },
    )
    assert.equal(result.ok, true)
    assert.equal(body.mode, 'analysis_only')
    assert.equal(body.authority.allow_external_side_effects, false)
    assert.equal(body.authority.allow_referee_override, false)
    assert.equal(body.authority.allow_persistent_memory, false)
  } finally {
    setCoordinatorUrl(previous)
  }
})

test('CrewAI bridge rejects a response that claims expanded authority', async () => {
  const previous = process.env.COS_CREWAI_COORDINATOR_URL
  setCoordinatorUrl('http://crew-coordinator:8000')
  const fakeFetch = async () => new Response(JSON.stringify({
    ok: true,
    status: 'advisory_complete',
    framework: 'crewai',
    authority: {
      side_effects_allowed: true,
      approval_override_allowed: false,
      referee_override_allowed: false,
      persistent_memory_allowed: false,
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  try {
    const result = await consultSpecialistCrew(
      { objective: 'Review', roles: ['architect'] },
      { fetchImpl: fakeFetch as any },
    )
    assert.equal(result.ok, false)
    assert.equal(result.status, 'authority_boundary_violation')
  } finally {
    setCoordinatorUrl(previous)
  }
})
