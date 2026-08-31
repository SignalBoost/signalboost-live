import assert from 'node:assert/strict'
import test from 'node:test'
import { createInMemoryA2AAgentRegistry } from '../a2a-host/a2a-agent-registry.ts'
import { createPortableA2AHost } from '../a2a-host/portable-a2a-host.ts'
import { getCOSA2ARuntimeHost, installCOSA2ARuntimeHost } from '../a2a-host/cos-runtime-host.ts'
import type { A2ATransport } from '../a2a-core/a2a-client.ts'

const tenantId = 'buyer-a'
const environmentId = 'prod'
const portableId = 'portable-marketing'

function registry(risk: 'advisory' | 'write' = 'advisory') {
  return createInMemoryA2AAgentRegistry({
    agents: [{
      agentId: 'marketing-agent',
      displayName: 'Marketing Specialist',
      description: 'Buyer-owned marketing specialist',
      transportRef: 'buyer-marketing-a2a',
      enabled: true,
      advertisedSkillIds: ['marketing.research', 'marketing.publish'],
    }],
    assignments: [{
      assignmentId: 'assignment-1',
      agentId: 'marketing-agent',
      tenantId,
      environmentId,
      portableId,
      enabled: true,
      allowedSkills: [{ skillId: risk === 'write' ? 'marketing.publish' : 'marketing.research', risk }],
    }],
  })
}

function transport(counter: { calls: number }): A2ATransport {
  return {
    async send(input) {
      counter.calls += 1
      return {
        jsonrpc: '2.0',
        id: (input.request as any).id,
        result: {
          kind: 'task',
          id: 'task-1',
          contextId: 'ctx-1',
          status: { state: 'completed' },
          artifacts: [{ artifactId: 'a1', parts: [{ kind: 'text', text: 'buyer specialist result' }] }],
        },
      }
    },
  }
}

test('portable A2A host composes Phase 3 orchestration over Phase 2 governed delegation', async () => {
  const counter = { calls: 0 }
  const host = createPortableA2AHost({ registry: registry(), transportFactory: { create: () => transport(counter) } })
  const result = await host.orchestrator.orchestrate({
    tenantId,
    environmentId,
    portableId,
    messageId: 'm1',
    text: 'Research this market.',
    plan: { familyId: 'marketing', skillId: 'marketing.research' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.selectedAgentId, 'marketing-agent')
  assert.equal(counter.calls, 1)
})

test('portable host preserves write approval boundary before transport creation', async () => {
  const counter = { calls: 0 }
  const host = createPortableA2AHost({ registry: registry('write'), transportFactory: { create: () => transport(counter) } })
  const blocked = await host.orchestrator.orchestrate({
    tenantId,
    environmentId,
    portableId,
    messageId: 'm2',
    text: 'Publish approved content.',
    plan: { familyId: 'marketing', skillId: 'marketing.publish' },
  })
  assert.equal(blocked.mode, 'approval_required')
  assert.equal(counter.calls, 0)
})

test('COS runtime host installation is explicit, replaceable, and reversible', () => {
  const counter = { calls: 0 }
  const first = createPortableA2AHost({ registry: registry(), transportFactory: { create: () => transport(counter) } })
  const second = createPortableA2AHost({ registry: registry(), transportFactory: { create: () => transport(counter) } })
  const restoreFirst = installCOSA2ARuntimeHost(first)
  assert.equal(getCOSA2ARuntimeHost(), first)
  const restoreSecond = installCOSA2ARuntimeHost(second)
  assert.equal(getCOSA2ARuntimeHost(), second)
  restoreSecond()
  assert.equal(getCOSA2ARuntimeHost(), first)
  restoreFirst()
  assert.equal(getCOSA2ARuntimeHost(), null)
})
