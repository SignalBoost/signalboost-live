import test from 'node:test'
import assert from 'node:assert/strict'
import { CosLeaderRuntime } from '../lib/ai/cos/autonomy/leaderRuntime.ts'
import { createCapabilityGuard } from '../lib/ai/cos/autonomy/guard.ts'
import { COS_AUTONOMY_SCHEMA_VERSION } from '../lib/ai/cos/autonomy/types.ts'

function makePortable(portableId, capabilityId, initialState = 'needs_action') {
  let state = initialState
  return {
    getManifest() {
      return {
        schemaVersion: COS_AUTONOMY_SCHEMA_VERSION,
        portableId,
        portableVersion: '1.0.0',
        capabilities: [{ capabilityId, version: '1.0.0', description: 'Universal capability', readOnly: false, reversible: true, requiresApproval: false, riskClass: 'low_risk_reversible', evidenceTypes: ['state'], verificationTypes: ['state'] }],
      }
    },
    async observe() { return { observedAt: new Date().toISOString(), summary: state, facts: { state }, evidenceIds: [`e:${portableId}:${state}`], stateFingerprint: state } },
    async invoke({ action }) { state = 'healthy'; return { actionId: action.actionId, status: 'completed', summary: 'done' } },
    async verify() { return { status: state === 'healthy' ? 'verified' : 'failed', goalSatisfied: state === 'healthy', summary: state } },
  }
}

const mission = { missionId: 'mission-1', purpose: 'Keep the attached portable healthy and effective.', priorities: ['prevent failure','restore service'], constraints: ['respect governance'], successCriteria: ['healthy'] }

function director() {
  return {
    async decide({ observation }) {
      const shouldAct = observation.facts.state !== 'healthy'
      return { decisionId: 'd1', objective: shouldAct ? 'Restore the portable to healthy state.' : '', priority: shouldAct ? 'high' : 'low', rationale: shouldAct ? 'Evidence shows intervention is needed.' : 'No intervention is justified.', evidenceIds: observation.evidenceIds, shouldAct, confidence: 0.95 }
    },
  }
}

function brain() {
  return {
    async plan({ objective, manifest }) { return { planId: 'p1', objective, actions: [{ actionId: 'a1', capabilityId: manifest.capabilities[0].capabilityId, justification: 'Use declared capability.', params: {} }], expectedOutcome: 'healthy', confidence: 0.95 } },
  }
}

test('COS leader initiates work from mission evidence rather than waiting for a task command', async () => {
  const portable = makePortable('portable-one', 'one.restore')
  const runtime = new CosLeaderRuntime({ portable, director: director(), brain: brain(), guard: createCapabilityGuard({ allowLowRiskReversibleWithoutApproval: true }) })
  const result = await runtime.tick({ mission, runId: 'run-1' })
  assert.equal(result.decision.shouldAct, true)
  assert.equal(result.status, 'acted')
  assert.equal(result.actionRun?.stopReason, 'goal_satisfied')
})

test('same COS leader operates a different portable with a different capability catalog', async () => {
  const portable = makePortable('portable-two', 'totally.different.capability')
  const runtime = new CosLeaderRuntime({ portable, director: director(), brain: brain(), guard: createCapabilityGuard({ allowLowRiskReversibleWithoutApproval: true }) })
  const result = await runtime.tick({ mission, runId: 'run-2' })
  assert.equal(result.status, 'acted')
  assert.equal(result.portableId, 'portable-two')
})

test('leader deliberately monitors when evidence does not justify action', async () => {
  const portable = makePortable('portable-three', 'three.change', 'healthy')
  const runtime = new CosLeaderRuntime({ portable, director: director(), brain: brain(), guard: createCapabilityGuard({ allowLowRiskReversibleWithoutApproval: true }) })
  const result = await runtime.tick({ mission, runId: 'run-3' })
  assert.equal(result.status, 'monitoring')
  assert.equal(result.decision.shouldAct, false)
  assert.equal(result.actionRun, undefined)
})
