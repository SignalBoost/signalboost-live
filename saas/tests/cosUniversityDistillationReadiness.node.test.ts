import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { summarizeUniversityDistillationReadiness } from '../lib/ai/cos/cosUniversityDistillationReadiness.ts'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('distillation readiness measures local ownership rather than training-job volume', () => {
  const summary = summarizeUniversityDistillationReadiness({
    artifacts: [
      { status: 'evaluation_pending', subject_id: 'reasoning', student_model_id: 'Qwen/Qwen3-4B' },
      { status: 'active', subject_id: 'support', student_model_id: 'Qwen/Qwen3-4B' },
    ],
    curriculum: [
      { status: 'prepared', source_count: 128, subject_id: 'reasoning' },
      { status: 'prepared', source_count: 25, subject_id: 'support' },
    ],
    usage: [
      { provider: 'runpod', route_owner: 'itmounts', fallback_from_owned: false, provider_estimated_cost_usd: 0.01, success: true },
      { provider: 'deepinfra', route_owner: 'external', fallback_from_owned: true, provider_estimated_cost_usd: 0.02, success: true },
      { provider: 'deepinfra', route_owner: 'external', fallback_from_owned: false, provider_estimated_cost_usd: 0.03, success: true },
      { provider: 'runpod', route_owner: 'itmounts', fallback_from_owned: false, provider_estimated_cost_usd: 0.01, success: true },
    ],
  })
  assert.equal(summary.artifacts.total, 2)
  assert.equal(summary.artifacts.active, 1)
  assert.equal(summary.artifacts.evaluationPending, 1)
  assert.deepEqual(summary.artifacts.activeSubjects, ['support'])
  assert.equal(summary.curriculum.preparedBatches, 2)
  assert.equal(summary.curriculum.sourceItems, 153)
  assert.equal(summary.inference.localOwnedRequests, 2)
  assert.equal(summary.inference.externalRequests, 2)
  assert.equal(summary.inference.localOwnedShare, 0.5)
  assert.equal(summary.inference.deepinfraShare, 0.5)
  assert.equal(summary.inference.fallbackShare, 0.25)
  assert.equal(summary.inference.externalEstimatedCostUsd, 0.05)
  assert.equal(summary.independence.readyForMassTraining, true)
  assert.equal(summary.independence.productionLocalCoverageProven, true)
  assert.equal(summary.independence.fullyIndependent, false)
})

test('zero traffic is unknown independence, not a false 100 percent score', () => {
  const summary = summarizeUniversityDistillationReadiness({ artifacts: [], curriculum: [], usage: [] })
  assert.equal(summary.inference.localOwnedShare, null)
  assert.equal(summary.inference.deepinfraShare, null)
  assert.equal(summary.inference.fallbackShare, null)
  assert.equal(summary.independence.productionLocalCoverageProven, false)
  assert.equal(summary.independence.fullyIndependent, false)
})

test('readiness endpoint is owner-only and reporting code cannot dispatch work', () => {
  const route = source('../app/api/admin/cos-university/distillation-readiness/route.ts')
  const report = source('../lib/ai/cos/cosUniversityDistillationReadiness.ts')
  assert.match(route, /requireOwner/)
  assert.match(route, /Cache-Control.*no-store/s)
  assert.match(report, /read_only_no_training_no_inference_no_provider_mutation/)
  assert.doesNotMatch(report, /submitHuggingFaceJob|dispatchUniversityApprovedTraining|provisionRunpod|callLocalModel|fetch\(/)
})
