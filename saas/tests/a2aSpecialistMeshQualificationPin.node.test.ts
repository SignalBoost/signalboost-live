import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createInMemoryA2AAgentRegistry } from '../a2a-host/a2a-agent-registry.ts'
import { runSpecialistMeshLiveFailoverAcceptance } from '../a2a-host/specialist-mesh-live-failover-acceptance.ts'

const tenantId = 'buyer-pin'
const environmentId = 'production'
const portableId = 'cos'
const skillId = 'marketing.research'
const primaryAgentId = 'pin-primary'
const fallbackAgentId = 'pin-fallback'

function fingerprint(value: string) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function card(name: string) {
  return {
    protocolVersion: '0.3.0', name, description: 'Pinned qualification specialist', url: 'https://buyer.example/a2a', preferredTransport: 'JSONRPC',
    defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'],
    skills: [{ id: skillId, name: 'Marketing research', description: 'Research marketing evidence', tags: ['marketing'] }],
  }
}

test('delegation uses the exact qualification snapshot already validated by acceptance', async () => {
  const registry = createInMemoryA2AAgentRegistry({
    agents: [
      { agentId: primaryAgentId, displayName: 'Primary', description: 'Primary', transportRef: 'primary-ref', enabled: true, advertisedSkillIds: [skillId], metadata: { meshCostScore: 1 } },
      { agentId: fallbackAgentId, displayName: 'Fallback', description: 'Fallback', transportRef: 'fallback-ref', enabled: true, advertisedSkillIds: [skillId], metadata: { meshCostScore: 50 } },
    ],
    assignments: [primaryAgentId, fallbackAgentId].map(agentId => ({
      assignmentId: `assignment-${agentId}`, agentId, tenantId, environmentId, portableId, enabled: true,
      allowedSkills: [{ skillId, risk: 'advisory' as const }],
    })),
  })

  let qualificationReads = 0
  const qualifications = {
    async snapshot() {
      qualificationReads += 1
      if (qualificationReads === 1) {
        return {
          [primaryAgentId]: { qualified: true, evidenceRef: 'qualification://primary/original' },
          [fallbackAgentId]: { qualified: true, evidenceRef: 'qualification://fallback/original' },
        }
      }
      return {
        [primaryAgentId]: { qualified: true, evidenceRef: 'qualification://shared/changed' },
        [fallbackAgentId]: { qualified: true, evidenceRef: 'qualification://shared/changed' },
      }
    },
  }

  let primarySends = 0
  let fallbackSends = 0
  const transportFactory = {
    create(input: { agentId: string }) {
      return {
        async send(request: any) {
          if (input.agentId === primaryAgentId) {
            primarySends += 1
            const error: any = new Error('socket hangup ECONNRESET')
            error.code = 'ECONNRESET'
            throw error
          }
          fallbackSends += 1
          return {
            jsonrpc: '2.0', id: request.request.id,
            result: { kind: 'task', id: 'pin-task', contextId: 'pin-context', status: { state: 'completed' }, artifacts: [] },
          }
        },
      }
    },
  }

  const record = await runSpecialistMeshLiveFailoverAcceptance({
    registry,
    transportFactory,
    qualifications,
    primary: { agentId: primaryAgentId, fetchAgentCard: async () => card('Primary') },
    fallback: { agentId: fallbackAgentId, fetchAgentCard: async () => card('Fallback') },
    tenantId, environmentId, portableId, familyId: 'marketing', skillId,
    messageId: 'pin-message', messageText: 'bounded acceptance probe', traceId: 'pin-trace',
  })

  assert.equal(qualificationReads, 1)
  assert.equal(primarySends, 1)
  assert.equal(fallbackSends, 1)
  assert.equal(record.primaryQualificationEvidenceFingerprint, fingerprint('qualification://primary/original'))
  assert.equal(record.fallbackQualificationEvidenceFingerprint, fingerprint('qualification://fallback/original'))
  assert.notEqual(record.primaryQualificationEvidenceFingerprint, record.fallbackQualificationEvidenceFingerprint)
  const serialized = JSON.stringify(record)
  assert.ok(!serialized.includes('qualification://'))
})
