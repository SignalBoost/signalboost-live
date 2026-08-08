import test from 'node:test'
import assert from 'node:assert/strict'
import { CosAutonomousRuntime } from '../lib/ai/cos/autonomy/runtime.ts'
import { createCapabilityGuard } from '../lib/ai/cos/autonomy/guard.ts'
import { COS_AUTONOMY_SCHEMA_VERSION } from '../lib/ai/cos/autonomy/types.ts'

function portable(portableId, capabilityId) {
  let state = 'idle'
  return {
    getManifest() {
      return {
        schemaVersion: COS_AUTONOMY_SCHEMA_VERSION,
        portableId,
        portableVersion: '1.0.0',
        capabilities: [{
          capabilityId,
          version: '1.0.0',
          description: 'Portable-specific capability hidden behind the universal contract.',
          readOnly: false,
          reversible: true,
          requiresApproval: false,
          riskClass: 'low_risk_reversible',
          evidenceTypes: ['state'],
          verificationTypes: ['state_verified'],
        }],
      }
    },
    async observe() {
      return { observedAt: new Date().toISOString(), summary: state, facts: { state }, evidenceIds: [`evidence:${portableId}:${state}`], stateFingerprint: state }
    },
    async invoke({ action }) {
      assert.equal(action.capabilityId, capabilityId)
      state = 'done'
      return { actionId: action.actionId, status: 'completed', summary: `${portableId} completed capability` }
    },
    async verify() {
      return { status: state === 'done' ? 'verified' : 'failed', goalSatisfied: state === 'done', summary: state === 'done' ? 'goal reached' : 'not done' }
    },
    async recover() {
      state = 'idle'
      return { status: 'restored', summary: 'restored' }
    },
  }
}

function brain() {
  return {
    async plan({ objective, manifest }) {
      return {
        planId: `plan:${manifest.portableId}`,
        objective,
        actions: [{ actionId: 'action-1', capabilityId: manifest.capabilities[0].capabilityId, justification: 'Use the capability exposed by this portable.', params: {} }],
        expectedOutcome: 'goal reached',
        confidence: 0.9,
      }
    },
  }
}

test('same COS autonomous runtime operates unrelated portables without product-specific code', async () => {
  const guard = createCapabilityGuard({ allowLowRiskReversibleWithoutApproval: true })
  for (const [portableId, capabilityId] of [['portable-alpha','alpha.execute'], ['portable-omega','omega.perform']]) {
    const runtime = new CosAutonomousRuntime({ portable: portable(portableId, capabilityId), brain: brain(), guard })
    const result = await runtime.run({ runId: `run:${portableId}`, objective: 'Complete the portable objective.' })
    assert.equal(result.status, 'completed')
    assert.equal(result.stopReason, 'goal_satisfied')
    assert.equal(result.portableId, portableId)
    assert.equal(result.cycles.length, 1)
  }
})

test('unknown capability hallucination fails closed before portable invocation', async () => {
  let invoked = false
  const p = portable('portable-a', 'real.capability')
  p.invoke = async () => { invoked = true; throw new Error('must not run') }
  const badBrain = { async plan({ objective }) { return { planId: 'bad', objective, actions: [{ actionId: 'a', capabilityId: 'invented.capability', justification: 'hallucinated', params: {} }], expectedOutcome: 'x', confidence: 0.99 } } }
  const runtime = new CosAutonomousRuntime({ portable: p, brain: badBrain, guard: createCapabilityGuard({ allowLowRiskReversibleWithoutApproval: true }) })
  const result = await runtime.run({ runId: 'run-bad', objective: 'Do something.' })
  assert.equal(result.status, 'stopped')
  assert.equal(result.stopReason, 'blocked')
  assert.equal(invoked, false)
})

test('mutation stops for approval unless buyer explicitly pre-authorizes the capability class', async () => {
  let invoked = false
  const p = portable('portable-b', 'change.state')
  const originalInvoke = p.invoke
  p.invoke = async args => { invoked = true; return originalInvoke(args) }
  const runtime = new CosAutonomousRuntime({ portable: p, brain: brain(), guard: createCapabilityGuard() })
  const result = await runtime.run({ runId: 'run-approval', objective: 'Change state.' })
  assert.equal(result.stopReason, 'approval_required')
  assert.equal(invoked, false)
})

test('kill switch prevents autonomous work before observation or execution', async () => {
  let observed = false
  const p = portable('portable-c', 'c.execute')
  p.observe = async () => { observed = true; throw new Error('must not observe') }
  const runtime = new CosAutonomousRuntime({ portable: p, brain: brain(), guard: createCapabilityGuard({ killSwitch: () => true }) })
  const result = await runtime.run({ runId: 'run-kill', objective: 'Operate.' })
  assert.equal(result.stopReason, 'kill_switch')
  assert.equal(observed, false)
})

test('repeated unchanged state halts rather than looping forever', async () => {
  const p = portable('portable-d', 'd.execute')
  p.invoke = async ({ action }) => ({ actionId: action.actionId, status: 'failed', summary: 'no effect' })
  p.verify = async () => ({ status: 'failed', goalSatisfied: false, summary: 'unchanged' })
  p.recover = async () => ({ status: 'recovered', summary: 'retry allowed' })
  const runtime = new CosAutonomousRuntime({
    portable: p,
    brain: brain(),
    guard: createCapabilityGuard({ allowLowRiskReversibleWithoutApproval: true }),
    policy: { maxCycles: 10, maxConsecutiveFailures: 10, maxRepeatedState: 1 },
  })
  const result = await runtime.run({ runId: 'run-loop', objective: 'Reach goal.' })
  assert.equal(result.stopReason, 'no_progress')
})
