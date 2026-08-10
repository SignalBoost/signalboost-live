import assert from 'node:assert/strict'
import test from 'node:test'
import { LearningEngine, type LearningObservation, type LearningStore, type LearnedStrategy } from '../lib/cos-core/layers/learning'
import { LocalReasoningDirector } from '../lib/cos-core/layers/autonomy/reasoning'

class MemoryLearningStore implements LearningStore {
  observations: LearningObservation[] = []

  async observe(observation: LearningObservation): Promise<void> {
    this.observations.push(observation)
  }

  async bestStrategy(taskId: string, capability: string): Promise<LearnedStrategy | null> {
    const rows = this.observations.filter(row => row.taskId === taskId && row.capability === capability && row.reusable)
    if (!rows.length) return null
    const grouped = new Map<string, { wins: number; total: number }>()
    for (const row of rows) {
      const current = grouped.get(row.strategy) ?? { wins: 0, total: 0 }
      current.total += 1
      if (row.succeeded) current.wins += 1
      grouped.set(row.strategy, current)
    }
    const best = [...grouped.entries()]
      .map(([strategy, value]) => ({ capability, strategy, score: value.wins / value.total, observations: value.total }))
      .sort((a, b) => b.score - a.score)[0]
    return best ?? null
  }
}

test('COS learns verified outcomes and reuses the stronger local strategy', async () => {
  const store = new MemoryLearningStore()
  const director = new LocalReasoningDirector(new LearningEngine(store))
  const task = {
    taskId: 'daily-learning',
    objective: 'Acquire approved knowledge efficiently',
    capability: 'knowledge-acquisition',
    context: ['approved sources available'],
    risk: 'low' as const,
  }

  const failed = await director.learnFromVerification({
    task,
    strategy: 'serial-source-scan',
    verification: {
      checks: [
        { name: 'knowledge acquired', passed: true },
        { name: 'within latency target', passed: false },
      ],
      latencyMs: 12000,
    },
  })
  assert.equal(failed.succeeded, false)

  const successful = await director.learnFromVerification({
    task,
    strategy: 'parallel-approved-sources',
    verification: {
      checks: [
        { name: 'knowledge acquired', passed: true, weight: 2 },
        { name: 'within latency target', passed: true },
        { name: 'zero provider cost', passed: true },
      ],
      latencyMs: 800,
      externalCostUsd: 0,
    },
  })
  assert.equal(successful.succeeded, true)
  assert.equal(successful.score, 1)

  const next = await director.plan(task)
  assert.equal(next.mode, 'local')
  assert.equal(next.strategy, 'parallel-approved-sources')
  assert.equal(store.observations.length, 2)
})
