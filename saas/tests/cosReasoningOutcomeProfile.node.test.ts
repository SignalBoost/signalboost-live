import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deriveReasoningOutcomeProfile,
  learnedPreferenceFor,
  type ReasoningOutcomeSample,
} from '../lib/ai/cos/reasoningOutcomeProfile.ts'

function samples(input: {
  problemClass?: string
  role: ReasoningOutcomeSample['workerRole']
  model: string
  successes: number
  failures?: number
  repairNeeded?: number
  escalated?: number
  latencyMs?: number
  costUsd?: number | null
}): ReasoningOutcomeSample[] {
  const failures = input.failures ?? 0
  const total = input.successes + failures
  return Array.from({ length: total }, (_, index) => ({
    turnId: `${input.role}-${input.model}-${index}`,
    problemClass: input.problemClass ?? 'code and implementation',
    workerRole: input.role,
    reasonerLabel: input.model,
    latencyMs: input.latencyMs ?? 1000,
    estimatedCostUsd: input.costUsd ?? null,
    verifiedSuccess: index < input.successes,
    repairNeeded: index < (input.repairNeeded ?? 0),
    escalated: index < (input.escalated ?? 0),
  }))
}

test('insufficient comparative evidence never changes routing', () => {
  const profile = deriveReasoningOutcomeProfile(samples({ role: 'coder', model: 'qwen-a', successes: 8 }))
  const preference = profile.preferences[0]
  assert.equal(preference.status, 'insufficient_evidence')
  assert.equal(preference.recommendedWorkerRole, null)
  assert.equal(profile.changesBehavior, false)
})

test('verified quality can select a worker and model combination', () => {
  const rows = [
    ...samples({ role: 'coder', model: 'qwen-a', successes: 8, latencyMs: 1400, costUsd: 0.002 }),
    ...samples({ role: 'primary', model: 'qwen-a', successes: 5, failures: 3, latencyMs: 900, costUsd: 0.001 }),
  ]
  const profile = deriveReasoningOutcomeProfile(rows)
  const preference = learnedPreferenceFor(profile, 'code and implementation')
  assert.equal(preference?.recommendedWorkerRole, 'coder')
  assert.equal(preference?.recommendedReasonerLabel, 'qwen-a')
})

test('repair and escalation evidence reduce the quality score', () => {
  const rows = [
    ...samples({ role: 'coder', model: 'qwen-a', successes: 8, repairNeeded: 6, escalated: 4 }),
    ...samples({ role: 'primary', model: 'qwen-a', successes: 8, repairNeeded: 0, escalated: 0 }),
  ]
  const preference = learnedPreferenceFor(deriveReasoningOutcomeProfile(rows), 'code and implementation')
  assert.equal(preference?.recommendedWorkerRole, 'primary')
})

test('quality ties can be broken by meaningful cost efficiency', () => {
  const rows = [
    ...samples({ role: 'coder', model: 'qwen-a', successes: 8, latencyMs: 1000, costUsd: 0.001 }),
    ...samples({ role: 'primary', model: 'qwen-a', successes: 8, latencyMs: 1000, costUsd: 0.002 }),
  ]
  const profile = deriveReasoningOutcomeProfile(rows, { minimumEfficiencyImprovement: 0.2 })
  const preference = learnedPreferenceFor(profile, 'code and implementation')
  assert.equal(preference?.recommendedWorkerRole, 'coder')
  assert.match(preference?.reason ?? '', /more efficient/)
})

test('a better historical model is represented explicitly in the learned recommendation', () => {
  const rows = [
    ...samples({ role: 'researcher', model: 'qwen-3.8', successes: 8, problemClass: 'planning and strategy' }),
    ...samples({ role: 'researcher', model: 'qwen-3.6', successes: 5, failures: 3, problemClass: 'planning and strategy' }),
  ]
  const preference = learnedPreferenceFor(deriveReasoningOutcomeProfile(rows), 'planning and strategy')
  assert.equal(preference?.recommendedReasonerLabel, 'qwen-3.8')
})

test('small quality and efficiency differences remain no-clear-winner', () => {
  const rows = [
    ...samples({ role: 'coder', model: 'qwen-a', successes: 8, latencyMs: 950, costUsd: 0.0019 }),
    ...samples({ role: 'primary', model: 'qwen-a', successes: 8, latencyMs: 1000, costUsd: 0.002 }),
  ]
  const profile = deriveReasoningOutcomeProfile(rows)
  assert.equal(profile.preferences[0].status, 'no_clear_winner')
})
