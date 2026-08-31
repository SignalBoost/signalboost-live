import assert from 'node:assert/strict'
import test from 'node:test'
import { createA2ADelegationRuntime } from '../a2a-host/a2a-delegation-runtime.ts'
import { activatePortableA2AHost, validateA2AHostActivation } from '../a2a-host/a2a-host-activation.ts'
import { createInMemoryA2AAgentRegistry } from '../a2a-host/a2a-agent-registry.ts'
import { createInMemoryA2ARuntimeObserver } from '../a2a-host/a2a-runtime-observability.ts'
import type { A2ATransport } from '../a2a-core/a2a-client.ts'

const tenantId = 'buyer-a'
const environmentId = 'prod'
const portableId = 'portable-sales'

function registry(options: { enabledAgent?: boolean; enabledAssignment?: boolean; risk?: 'advisory' | 'write' | 'consequential' } = {}) {
  const risk = options.risk ?? 'advisory'
  const skillId = risk === 'write' ? 'sales.send-outreach' : risk === 'consequential' ? 'marketing.campaign-mutate' : 'sales.account-research'
  return createInMemoryA2AAgentRegistry({
    agents: [{
      agentId: 'sales-agent',
      displayName: 'Buyer Sales Agent',
      description: 'Buyer-owned specialist',
      transportRef: 'buyer-sales-primary',
      enabled: options.enabledAgent ?? true,
      advertisedSkillIds: [skillId],
    }],
    assignments: [{
      assignmentId: 'assignment-1',
      agentId: 'sales-agent',
      tenantId,
      environmentId,
      portableId,
      enabled: options.enabledAssignment ?? true,
      allowedSkills: [{ skillId, risk }],
    }],
  })
}

function successfulTransport(counter: { creates: number; sends: number }) {
  return {
    create(input: any): A2ATransport {
      counter.creates += 1
      assert.equal(input.transportRef, 'buyer-sales-primary')
      assert.deepEqual(input.scope, { tenantId, environmentId, portableId })
      return {
        async send(request) {
          counter.sends += 1
          return {
            jsonrpc: '2.0',
            id: (request.request as any).id,
            result: { text: 'remote specialist result', privatePayload: 'must-not-enter-observation' },
          }
        },
      }
    },
  }
}

test('Phase 6 activation validates enabled buyer agents/assignments and returns secret-free diagnostics', async () => {
  const counter = { creates: 0, sends: 0 }
  const activated = await activatePortableA2AHost({
    registry: registry(),
    transportFactory: successfulTransport(counter),
    now: () => new Date('2026-08-31T16:00:00.000Z'),
  })
  assert.equal(activated.summary.enabledAgentCount, 1)
  assert.equal(activated.summary.enabledAssignmentCount, 1)
  assert.deepEqual(activated.summary.transportRefs, ['buyer-sales-primary'])
  assert.equal(activated.summary.activatedAt, '2026-08-31T16:00:00.000Z')
  assert.equal(counter.creates, 0, 'activation must not create a remote transport')
  assert.ok(activated.host.orchestrator)
})

test('Phase 6 activation fails closed when no enabled deployable agent assignment exists', async () => {
  await assert.rejects(() => validateA2AHostActivation(registry({ enabledAgent: false })), /a2a_activation_no_enabled_agents/)
  await assert.rejects(() => validateA2AHostActivation(registry({ enabledAssignment: false })), /a2a_activation_no_enabled_assignments/)
})

test('runtime observation proves exact delegated metadata without prompt or response capture', async () => {
  const observer = createInMemoryA2ARuntimeObserver()
  const counter = { creates: 0, sends: 0 }
  const times = [new Date('2026-08-31T16:00:00.000Z'), new Date('2026-08-31T16:00:00.125Z')]
  const runtime = createA2ADelegationRuntime({
    registry: registry(),
    transportFactory: successfulTransport(counter),
    observe: observer,
    now: () => times.shift() ?? new Date('2026-08-31T16:00:00.125Z'),
    createId: () => 'observation-1',
  })
  const result = await runtime.invoke({
    tenantId,
    environmentId,
    portableId,
    agentId: 'sales-agent',
    skillId: 'sales.account-research',
    messageId: 'message-1',
    text: 'PRIVATE PROMPT THAT MUST NOT BE CAPTURED',
    traceId: 'trace-1',
  })
  assert.equal(result.ok, true)
  assert.equal(counter.creates, 1)
  assert.equal(counter.sends, 1)
  const [event] = observer.snapshot()
  assert.ok(event)
  assert.equal(event.durationMs, 125)
  assert.equal(event.mode, 'delegated')
  assert.equal(event.transportRef, 'buyer-sales-primary')
  assert.equal(event.traceId, 'trace-1')
  assert.equal(event.assignmentId, 'assignment-1')
  const serialized = JSON.stringify(event)
  assert.ok(!serialized.includes('PRIVATE PROMPT'))
  assert.ok(!serialized.includes('remote specialist result'))
  assert.ok(!serialized.includes('privatePayload'))
  assert.ok(!serialized.includes('http://') && !serialized.includes('https://'))
})

test('blocked write emits observation before transport creation and preserves approval boundary', async () => {
  const observer = createInMemoryA2ARuntimeObserver()
  const counter = { creates: 0, sends: 0 }
  const runtime = createA2ADelegationRuntime({
    registry: registry({ risk: 'write' }),
    transportFactory: successfulTransport(counter),
    observe: observer,
  })
  const result = await runtime.invoke({
    tenantId,
    environmentId,
    portableId,
    agentId: 'sales-agent',
    skillId: 'sales.send-outreach',
    messageId: 'message-2',
    text: 'send this outreach',
  })
  assert.equal(result.ok, false)
  assert.equal(result.mode, 'approval_required')
  assert.equal(counter.creates, 0)
  assert.equal(counter.sends, 0)
  const [event] = observer.snapshot()
  assert.equal(event?.mode, 'approval_required')
  assert.equal(event?.risk, 'write')
  assert.equal(event?.ok, false)
})

test('telemetry sink failure never becomes execution authority', async () => {
  const counter = { creates: 0, sends: 0 }
  const runtime = createA2ADelegationRuntime({
    registry: registry(),
    transportFactory: successfulTransport(counter),
    observe: { async append() { throw new Error('buyer telemetry unavailable') } },
  })
  const result = await runtime.invoke({
    tenantId,
    environmentId,
    portableId,
    agentId: 'sales-agent',
    skillId: 'sales.account-research',
    messageId: 'message-3',
    text: 'research this account',
  })
  assert.equal(result.ok, true)
  assert.equal(counter.creates, 1)
  assert.equal(counter.sends, 1)
})
