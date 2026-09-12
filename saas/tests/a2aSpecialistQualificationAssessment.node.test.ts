import assert from 'node:assert/strict'
import test from 'node:test'
import type { A2ATransport } from '../a2a-core/a2a-client.ts'
import { createInMemoryA2AAgentRegistry } from '../a2a-host/a2a-agent-registry.ts'
import {
  persistSupabaseSpecialistQualificationAssessment,
  runSpecialistQualificationAssessment,
} from '../a2a-host/specialist-qualification-assessment.ts'

const tenantId = 'tenant-a'
const environmentId = 'production'
const portableId = 'cos'
const agentId = 'software-specialist'
const skillId = 'software.analyze'
const transportRef = 'software-a2a'

function registry(risk: 'advisory' | 'write' = 'advisory') {
  return createInMemoryA2AAgentRegistry({
    agents: [{
      agentId,
      displayName: 'Software Specialist',
      description: 'Qualification candidate',
      transportRef,
      enabled: true,
      advertisedSkillIds: [skillId],
    }],
    assignments: [{
      assignmentId: 'software-assignment',
      agentId,
      tenantId,
      environmentId,
      portableId,
      enabled: true,
      allowedSkills: [{ skillId, risk }],
    }],
  })
}

function successfulTransport(onSend?: () => void): A2ATransport {
  return {
    async send(input) {
      onSend?.()
      const request = input.request as Record<string, any>
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          kind: 'task',
          id: 'qualification-task',
          contextId: 'qualification-context',
          status: { state: 'completed' },
          artifacts: [{ artifactId: 'analysis', name: 'analysis', parts: [{ kind: 'text', text: 'Verified analysis output.' }] }],
        },
      }
    },
  }
}

function baseOptions(overrides: Record<string, unknown> = {}) {
  return {
    registry: registry(),
    transportFactory: { create: () => successfulTransport() },
    verifier: {
      async verify() {
        return { qualified: true, verifierId: 'host-independent-verifier', evidenceRef: 'assessment://heldout/software-analyze/1' }
      },
    },
    tenantId,
    environmentId,
    portableId,
    agentId,
    skillId,
    assessmentId: 'assessment-1',
    messageId: 'message-1',
    probeText: 'Analyze the supplied held-out software case and return the bounded diagnosis.',
    validForMs: 86_400_000,
    now: () => new Date('2026-09-12T22:30:00Z'),
    ...overrides,
  } as any
}

test('qualification requires a real advisory transport attempt plus an independent verifier', async () => {
  let sends = 0
  let verifiedResponse: unknown
  const record = await runSpecialistQualificationAssessment(baseOptions({
    transportFactory: { create: () => successfulTransport(() => { sends += 1 }) },
    verifier: {
      async verify(input: any) {
        verifiedResponse = input.response
        return { qualified: true, verifierId: 'host-independent-verifier', evidenceRef: 'assessment://heldout/software-analyze/1' }
      },
    },
  }))

  assert.equal(sends, 1)
  assert.equal((verifiedResponse as any).kind, 'task')
  assert.equal(record.qualified, true)
  assert.equal(record.executionAttempted, true)
  assert.equal(record.verifierId, 'host-independent-verifier')
  assert.equal(record.evidenceRef, 'assessment://heldout/software-analyze/1')
  assert.equal(record.observedAt, '2026-09-12T22:30:00.000Z')
  assert.equal(record.validUntil, '2026-09-13T22:30:00.000Z')
  assert.equal('response' in record, false)
})

test('qualification rejects self-verification even after successful advisory execution', async () => {
  await assert.rejects(() => runSpecialistQualificationAssessment(baseOptions({
    verifier: { async verify() { return { qualified: true, verifierId: agentId, evidenceRef: 'self://claim' } } },
  })), /self_verification_rejected/)
})

test('qualification cannot probe a write skill through the advisory assessment path', async () => {
  let sends = 0
  await assert.rejects(() => runSpecialistQualificationAssessment(baseOptions({
    registry: registry('write'),
    transportFactory: { create: () => successfulTransport(() => { sends += 1 }) },
  })), /a2a_phase1_non_advisory_delegation_blocked/)
  assert.equal(sends, 0)
})

test('pre-send resolution failures create no verifier decision', async () => {
  let verifierCalls = 0
  await assert.rejects(() => runSpecialistQualificationAssessment(baseOptions({
    tenantId: 'wrong-tenant',
    verifier: { async verify() { verifierCalls += 1; return { qualified: true, verifierId: 'verifier', evidenceRef: 'evidence' } } },
  })), /specialist_qualification_agent_unavailable/)
  assert.equal(verifierCalls, 0)
})

test('a successful probe may be independently rejected and persists the negative decision without raw response', async () => {
  const record = await runSpecialistQualificationAssessment(baseOptions({
    assessmentId: 'assessment-negative',
    verifier: {
      async verify() {
        return { qualified: false, verifierId: 'host-independent-verifier', evidenceRef: 'assessment://heldout/software-analyze/fail-1' }
      },
    },
  }))
  assert.equal(record.qualified, false)

  const writes: any[] = []
  const db = {
    from(table: string) {
      assert.equal(table, 'a2a_specialist_qualifications')
      return {
        async insert(payload: any) { writes.push(payload); return { error: null } },
      }
    },
  } as any
  await persistSupabaseSpecialistQualificationAssessment(db, record)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].qualification_key, 'qualification:assessment-negative')
  assert.equal(writes[0].qualified, false)
  assert.equal(writes[0].verified_by, 'host-independent-verifier')
  assert.equal(writes[0].evidence_ref, 'assessment://heldout/software-analyze/fail-1')
  assert.equal('response' in writes[0], false)
  assert.equal('probe_text' in writes[0], false)
})
