import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CosReasoningEngine,
  buildCosReasoningPlan,
  type CosReasoningWorker,
} from '../lib/ai/cos/cosReasoningControlPlane.ts'

function worker(input: Partial<CosReasoningWorker> & Pick<CosReasoningWorker, 'id' | 'role' | 'kind' | 'label'>): CosReasoningWorker {
  return {
    priority: 0,
    execute: async () => ({ text: `answer:${input.id}` }),
    ...input,
  }
}

test('COS owns the plan while the model remains a replaceable worker', () => {
  const plan = buildCosReasoningPlan({ prompt: 'Diagnose a Postgres latency regression.' })
  assert.equal(plan.policyVersion, 'cos-reasoning-control-plane-v2')
  assert.equal(plan.requestedRole, 'primary')
  assert.equal(plan.steps[0].role, 'primary')
  assert.match(plan.objective, /Postgres latency/)
})

test('the primary worker is selected by default and provenance is preserved', async () => {
  const engine = new CosReasoningEngine([
    worker({ id: 'qwen', role: 'primary', kind: 'cos-open-model', label: 'managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B' }),
  ])
  const execution = await engine.run({ prompt: 'Explain the failure.' })
  assert.equal(execution?.result.text, 'answer:qwen')
  assert.equal(execution?.worker.label, 'managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B')
  assert.equal(execution?.fallbackUsed, false)
})

test('a specialist can be selected without changing COS orchestration', async () => {
  const engine = new CosReasoningEngine([
    worker({ id: 'primary', role: 'primary', kind: 'cos-open-model', label: 'qwen-primary' }),
    worker({ id: 'coder', role: 'coder', kind: 'cos-open-model', label: 'qwen-coder' }),
  ])
  const execution = await engine.run({ prompt: 'Repair this function.', requestedRole: 'coder' })
  assert.equal(execution?.worker.id, 'coder')
  assert.equal(execution?.plan.requestedRole, 'coder')
})

test('missing specialists fall back to the primary COS worker, not an outside provider', async () => {
  const engine = new CosReasoningEngine([
    worker({ id: 'primary', role: 'primary', kind: 'cos-open-model', label: 'qwen-primary' }),
  ])
  const execution = await engine.run({ prompt: 'Verify the claim.', requestedRole: 'verifier' })
  assert.equal(execution?.worker.id, 'primary')
  assert.equal(execution?.fallbackUsed, true)
})

test('a failed specialist does not retry the same model under the primary role', async () => {
  let primaryCalls = 0
  const engine = new CosReasoningEngine([
    worker({ id: 'primary', role: 'primary', kind: 'cos-open-model', label: 'same-qwen', execute: async () => { primaryCalls += 1; return { text: 'primary' } } }),
    worker({ id: 'coder', role: 'coder', kind: 'cos-open-model', label: 'same-qwen', execute: async () => null }),
  ])
  assert.equal(await engine.run({ prompt: 'Repair code.', requestedRole: 'coder' }), null)
  assert.equal(primaryCalls, 0)
})

test('a genuinely different primary runtime remains a bounded specialist fallback', async () => {
  const engine = new CosReasoningEngine([
    worker({ id: 'primary', role: 'primary', kind: 'cos-open-model', label: 'qwen-primary', execute: async () => ({ text: 'primary-fallback' }) }),
    worker({ id: 'coder', role: 'coder', kind: 'cos-open-model', label: 'specialist-model', execute: async () => null }),
  ])
  const execution = await engine.run({ prompt: 'Repair code.', requestedRole: 'coder' })
  assert.equal(execution?.worker.id, 'primary')
  assert.equal(execution?.fallbackUsed, true)
  assert.deepEqual(execution?.attemptedWorkerIds, ['coder', 'primary'])
})

test('external closed-model workers are excluded unless COS explicitly allows escalation', async () => {
  const engine = new CosReasoningEngine([
    worker({ id: 'claude', role: 'primary', kind: 'external-closed-model', label: 'anthropic:claude' }),
  ])
  assert.equal(await engine.run({ prompt: 'Reason about this.' }), null)
  const allowed = await engine.run({ prompt: 'Reason about this.', allowExternalEscalation: true })
  assert.equal(allowed?.worker.id, 'claude')
})

test('a failed open worker never silently crosses the closed-model boundary', async () => {
  const engine = new CosReasoningEngine([
    worker({ id: 'qwen', role: 'primary', kind: 'cos-open-model', label: 'qwen', execute: async () => null }),
    worker({ id: 'claude', role: 'primary', kind: 'external-closed-model', label: 'claude' }),
  ])
  const execution = await engine.run({ prompt: 'Reason about this.' })
  assert.equal(execution, null)
})

test('worker priority is deterministic and independent of provider name', async () => {
  const engine = new CosReasoningEngine([
    worker({ id: 'a', role: 'primary', kind: 'cos-open-model', label: 'provider-a', priority: 5 }),
    worker({ id: 'b', role: 'primary', kind: 'cos-open-model', label: 'provider-b', priority: 20 }),
  ])
  const execution = await engine.run({ prompt: 'Choose a worker.' })
  assert.equal(execution?.worker.id, 'b')
})

test('duplicate worker ids cannot create ambiguous routing', () => {
  const engine = new CosReasoningEngine([
    worker({ id: 'same', role: 'primary', kind: 'cos-open-model', label: 'first' }),
    worker({ id: 'same', role: 'coder', kind: 'cos-open-model', label: 'second' }),
  ])
  assert.equal(engine.listWorkers().length, 1)
  assert.equal(engine.listWorkers()[0].label, 'first')
})

test('blank prompts are rejected before any worker is invoked', async () => {
  let calls = 0
  const engine = new CosReasoningEngine([
    worker({ id: 'primary', role: 'primary', kind: 'cos-open-model', label: 'qwen', execute: async () => { calls += 1; return { text: 'x' } } }),
  ])
  assert.equal(await engine.run({ prompt: '   ' }), null)
  assert.equal(calls, 0)
})
