import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryMissionEventBus, InMemoryMissionStore, MissionOrchestrator, RuleBasedMissionReasoner, MissionSafetyGateway, NonMutatingMissionExecutor, missionTopics, transitionMission } from '../lib/supervisor/index.ts'

const time = '2026-07-23T00:00:00.000Z'
let n = 0
const setup = () => { n = 0; const eventBus = new InMemoryMissionEventBus(); const missionStore = new InMemoryMissionStore(); return { eventBus, missionStore, deps: { eventBus, missionStore, clock: () => time, id: (kind: string) => `${kind}-${++n}` } } }
const ci = () => ({ eventId: 'ci-1', eventType: 'ci.failure.detected', occurredAt: time, correlationId: 'corr-1', environment: 'sandbox', payload: { repository: 'signalboost' }, schemaVersion: 'event-v1' })

test('CI failure reaches only the non-mutating manual-review executor after an approved binding', async () => {
  const { deps, eventBus } = setup(); const decisions: any[] = []; const bindings: any[] = []; const feedback: any[] = []
  await eventBus.subscribe<any>(missionTopics.rawDecisions, e => { decisions.push(e.payload) }); await eventBus.subscribe<any>(missionTopics.approvedDecisions, e => { bindings.push(e.payload.binding) }); await eventBus.subscribe<any>(missionTopics.executions, e => { feedback.push(e.payload) })
  await new RuleBasedMissionReasoner(deps).start(); await new MissionSafetyGateway(deps).start(); await new NonMutatingMissionExecutor(deps).start(); await new MissionOrchestrator(deps).accept(ci())
  assert.equal(decisions.length, 1); assert.equal(bindings[0].policyOutcome, 'approved'); assert.deepEqual(feedback.map(x => x.status), ['manual_review_routed'])
})

test('changed decision after policy evaluation is rejected with no execution feedback', async () => {
  const { deps, eventBus } = setup(); let executions = 0; await eventBus.subscribe<any>(missionTopics.executions, () => { executions++ }); await new RuleBasedMissionReasoner(deps).start(); await new MissionSafetyGateway(deps).start(); await new NonMutatingMissionExecutor(deps).start()
  await eventBus.subscribe<any>(missionTopics.approvedDecisions, async e => { if (e.eventId !== 'tampered') await eventBus.publish(missionTopics.approvedDecisions, { ...e, eventId: 'tampered', payload: { ...e.payload, decision: { ...e.payload.decision, confidence: 99 } } }) })
  await new MissionOrchestrator(deps).accept(ci()); assert.equal(executions, 1)
})

test('terminal missions cannot return active', () => { assert.throws(() => transitionMission({ missionId:'m', missionType:'x', revision:1, status:'COMPLETED', environment:'sandbox', title:'x', objective:'x', correlationId:'c', sourceEventIds:['e'], riskLevel:'low', createdAt:time, updatedAt:time, metadata:{}, schemaVersion:'v' }, 'IN_PROGRESS', time)) })
