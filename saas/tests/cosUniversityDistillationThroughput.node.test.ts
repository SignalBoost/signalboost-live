import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MASS_DISTILLATION_DEFAULT_PREPARED_BATCH_BUFFER_TARGET,
  MASS_DISTILLATION_MAX_PREPARED_BATCH_BUFFER_TARGET,
  MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES,
  massDistillationPreparedBatchBufferTarget,
} from '../lib/ai/cos/cosUniversityDistillationCurriculumPlan.ts'
import {
  MASS_DISTILLATION_ROLLING_BATCHES_PER_CAMPAIGN,
  MASS_DISTILLATION_ROLLING_MAX_AUTHORIZED_COST_USD,
} from '../lib/ai/cos/cosUniversityMassDistillationRollingAuthorization.ts'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('distillation preparation maintains a configurable ready inventory at five-minute cadence', () => {
  assert.equal(MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES, 5)
  assert.equal(MASS_DISTILLATION_DEFAULT_PREPARED_BATCH_BUFFER_TARGET, 10)
  assert.equal(MASS_DISTILLATION_MAX_PREPARED_BATCH_BUFFER_TARGET, 100)
  assert.equal(massDistillationPreparedBatchBufferTarget({}), 10)
  assert.equal(massDistillationPreparedBatchBufferTarget({ COS_UNIVERSITY_DISTILLATION_PREPARED_BUFFER_TARGET: '25' }), 25)
  assert.equal(massDistillationPreparedBatchBufferTarget({ COS_UNIVERSITY_DISTILLATION_PREPARED_BUFFER_TARGET: '500' }), 100)
})

test('ready-inventory replenishment runs before paid authorization and may overlap budget pauses', () => {
  const workflow = source('../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts')
  const packageAt = workflow.indexOf('prepareUniversityMassDistillationCurriculum(now)')
  const inventoryAt = workflow.indexOf('preparedMassDistillationInventory()')
  const replenishAt = workflow.indexOf('replenishUniversityMassDistillationCurriculum')
  const authorizeAt = workflow.indexOf('authorizeNextUniversityMassDistillationCampaign()')
  assert.ok(packageAt > 0)
  assert.ok(inventoryAt > packageAt)
  assert.ok(replenishAt > 0)
  assert.ok(authorizeAt > inventoryAt)
  assert.match(workflow, /preparedBeforeReplenishment < preparedBufferTarget/)
  assert.match(workflow, /preparedAfterReplenishment/)
})

test('preparation speedup does not widen University paid-training authority', () => {
  assert.equal(MASS_DISTILLATION_ROLLING_MAX_AUTHORIZED_COST_USD, 25)
  assert.equal(MASS_DISTILLATION_ROLLING_BATCHES_PER_CAMPAIGN, 1)
  const replenishment = source('../lib/ai/cos/cosUniversityDistillationCurriculumReplenishment.ts')
  assert.match(replenishment, /maxExternalCostUsdPerCycle:\s*0/)
  assert.match(replenishment, /allowedSourceKinds:\s*new Set\(\['scientific_journal'\]\)/)
  assert.match(replenishment, /minimumConfidence:\s*0\.80/)
})
