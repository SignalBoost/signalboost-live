import test from 'node:test'
import assert from 'node:assert/strict'
import {
  InMemoryMissionEventBus,
  InMemoryMissionStore,
  MissionOrchestrator,
  RuleBasedMissionReasoner,
  MissionSafetyGateway,
  NonMutatingMissionExecutor,
  missionSchema,
  missionTopics,
  transitionMission,
} from '../lib/supervisor/index.ts'

const time = '2026-07-23T00:00:00.000Z'
let n = 0

const setup = () => {
  n = 0
  const eventBus = new InMemoryMissionEventBus()
  const missionStore = new InMemoryMissionStore()
  const deps = { eventBus, missionStore, clock: () => time, id: (kind: string) => `${kind}-${++n}` }
  return { deps, eventBus, missionStore }
}

const ci = () => ({
  eventId: 'ci-1',
  eventType: 'ci.failure.detected',
  occurredAt: time,
  correlationId: 'corr-1',
  environment: 'sandbox',
  payload: { repository: 'signalboost' },
  schemaVersion: 'event-v1',
})

const mission = () => ({
  missionId: 'm-1',
  missionType: 'ci_failure_manual_review',
  revision: 1,
  status: 'NEW',
  environment: 'sandbox',
  title: 'CI failure',
  objective: 'manual review',
  correlationId: 'c',
  sourceEventIds: ['e'],
  riskLevel: 'low',
  createdAt: time,
  updatedAt: time,
  metadata: { safe: true },
  schemaVersion: 'mission-v1',
})

test('valid Mission parses and invalid Mission is rejected', () => {
  assert.equal(missionSchema.parse(mission()).missionId, 'm-1')
  assert.throws(() => missionSchema.parse({ ...mission(), revision: 0 }))
  assert.throws(() => missionSchema.parse({ ...mission(), metadata: { token: 'plaintext' } }))
})

test('terminal Mission states cannot return to active states', () => {
  assert.throws(() => transitionMission({ ...mission(), status: 'COMPLETED' }, 'IN_PROGRESS', time))
})

test('in-memory bus delivers deterministically to multiple subscribers and unsubscribe works', async () => {
  const bus = new InMemoryMissionEventBus()
  const seen: string[] = []
  const first = await bus.subscribe<any>(missionTopics.systemEvents, (event) => { seen.push(`a:${event.payload}`) })
  await bus.subscribe<any>(missionTopics.systemEvents, (event) => { seen.push(`b:${event.payload}`) })
  await bus.publish(missionTopics.systemEvents, { eventId: '1', occurredAt: time, correlationId: 'c', payload: 'one' })
  first.unsubscribe()
  await bus.publish(missionTopics.systemEvents, { eventId: '2', occurredAt: time, correlationId: 'c', payload: 'two' })
  assert.deepEqual(seen, ['a:one', 'b:one', 'b:two'])
})

test('mission store rejects duplicates and stale updates without exposing mutable entries', async () => {
  const store = new InMemoryMissionStore()
  await store.create(mission())
  await assert.rejects(store.create(mission()))
  const read = await store.get('m-1')
  read!.title = 'mutated'
  assert.equal((await store.get('m-1'))!.title, 'CI failure')
  await assert.rejects(store.update('m-1', 2, 'IN_PROGRESS', time))
  assert.equal((await store.update('m-1', 1, 'IN_PROGRESS', time)).revision, 2)
})

test('complete in-memory lifecycle routes CI failure to manual review with no network or shell', async () => {
  const { deps, eventBus } = setup()
  const missions: any[] = []
  const decisions: any[] = []
  const guardrails: any[] = []
  const feedback: any[] = []
  await eventBus.subscribe<any>(missionTopics.missions, (event) => { missions.push(event.payload) })
  await eventBus.subscribe<any>(missionTopics.rawDecisions, (event) => { decisions.push(event.payload) })
  await eventBus.subscribe<any>(missionTopics.guardrails, (event) => { guardrails.push(event.payload) })
  await eventBus.subscribe<any>(missionTopics.executions, (event) => { feedback.push(event.payload) })
  await new RuleBasedMissionReasoner(deps).start()
  await new MissionSafetyGateway(deps).start()
  await new NonMutatingMissionExecutor(deps).start()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('network forbidden') }
  try {
    const created = await new MissionOrchestrator(deps).accept(ci())
    assert.equal(created.status, 'NEW')
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(missions.length, 1)
  assert.equal(decisions[0].actionType, 'route_to_manual_review')
  assert.equal(guardrails[0].status, 'approved')
  assert.deepEqual(feedback.map((item) => item.status), ['manual_review_routed'])
})

test('dangerous decisions are blocked and never reach executor', async () => {
  const { deps, eventBus } = setup()
  const guardrails: any[] = []
  let executions = 0
  await eventBus.subscribe<any>(missionTopics.guardrails, (event) => { guardrails.push(event.payload) })
  await eventBus.subscribe<any>(missionTopics.executions, () => { executions += 1 })
  await new MissionSafetyGateway(deps).start()
  await new NonMutatingMissionExecutor(deps).start()
  await eventBus.publish(missionTopics.rawDecisions, {
    eventId: 'bad',
    occurredAt: time,
    correlationId: 'c',
    payload: { decisionId: 'd', missionId: 'missing', missionRevision: 1, actionType: 'delete_everything', shellCommand: 'rm -rf /' },
  })
  assert.equal(guardrails[0].status, 'blocked')
  assert.equal(executions, 0)
})

test('approval-required outcomes cannot reach execution feedback', async () => {
  const { deps, eventBus } = setup()
  let executions = 0
  await eventBus.subscribe<any>(missionTopics.executions, () => { executions += 1 })
  await new NonMutatingMissionExecutor(deps).start()
  await eventBus.publish(missionTopics.approvedDecisions, {
    eventId: 'approval-required',
    occurredAt: time,
    correlationId: 'c',
    payload: {
      decision: {
        decisionId: 'd-1',
        missionId: 'm-1',
        missionRevision: 1,
        actionType: 'route_to_manual_review',
        riskLevel: 'low',
        targetProvider: null,
        targetEnvironment: 'sandbox',
        proposedAction: 'Proposed manual-review action only.',
        shellCommand: null,
        url: null,
        credentials: null,
        externalSideEffect: false,
        createdAt: time,
        schemaVersion: 'mission-decision-v1',
      },
      outcome: {
        outcomeId: 'g-1',
        missionId: 'm-1',
        decisionId: 'd-1',
        missionRevision: 1,
        status: 'approval_required',
        reasons: ['Human approval required.'],
        evaluatedAt: time,
        policyVersion: 'supervisor-core-v1',
        schemaVersion: 'mission-guardrail-v1',
      },
    },
  })
  assert.equal(executions, 0)
})
