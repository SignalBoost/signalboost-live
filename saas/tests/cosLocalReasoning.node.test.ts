import assert from 'node:assert/strict'
import test from 'node:test'
import { LearningEngine, type LearningObservation, type LearningStore } from '../lib/cos-core/layers/learning'
import { LocalReasoningDirector } from '../lib/cos-core/layers/autonomy/reasoning'

class MemoryLearningStore implements LearningStore {
  observations: LearningObservation[] = []

  async observe(observation: LearningObservation): Promise<void> {
    this.observations.push(observation)
  }

  async bestStrategy(taskId: string, capability: string) {
    const relevant = this.observations.filter((item) => item.taskId === taskId && item.capability === capability)
    if (!relevant.length) return null
    const successful = relevant.filter((item) => item.succeeded)
    if (!successful.length) return null
    const strategy = successful[successful.length - 1].strategy
    return { capability, strategy, score: 0.9, observations: successful.length }
  }
}

test('COS plans locally without a provider when confidence is sufficient', async () => {
  const store = new MemoryLearningStore()
  const director = new LocalReasoningDirector(new LearningEngine(store))
  const plan = await director.plan({
    taskId: 'task-1',
    objective: 'Prepare a deployment verification plan',
    capability: 'deployment-verification',
    context: ['Vercel deployment is green'],
    risk: 'low',
  })

  assert.equal(plan.mode, 'local')
  assert.ok(plan.confidence >= 0.62)
  assert.ok(plan.steps.length >= 1)
})

test('COS escalates high-risk low-context work', async () => {
  const store = new MemoryLearningStore()
  const director = new LocalReasoningDirector(new LearningEngine(store))
  const plan = await director.plan({
    taskId: 'task-2',
    objective: 'Resolve an unfamiliar production incident',
    capability: 'incident-analysis',
    risk: 'high',
  })

  assert.equal(plan.mode, 'escalate')
  assert.ok(plan.confidence < 0.62)
})

test('COS learns a successful strategy and reuses it on the next plan', async () => {
  const store = new MemoryLearningStore()
  const learning = new LearningEngine(store)
  const director = new LocalReasoningDirector(learning)
  const task = {
    taskId: 'task-3',
    objective: 'Verify a known deployment workflow',
    capability: 'deployment-verification',
    risk: 'low' as const,
  }

  await director.recordOutcome({ task, strategy: 'verify-build-then-health', succeeded: true, latencyMs: 100 })
  const plan = await director.plan(task)

  assert.equal(plan.mode, 'local')
  assert.equal(plan.strategy, 'verify-build-then-health')
  assert.ok(plan.confidence >= 0.62)
})
