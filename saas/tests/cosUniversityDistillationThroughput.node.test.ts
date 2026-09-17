// saas/tests/cosUniversityDistillationThroughput.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MASS_DISTILLATION_DEFAULT_PREPARED_BATCH_BUFFER_TARGET,
  MASS_DISTILLATION_DEFAULT_QUERIES_PER_SUBJECT,
  MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES,
  buildMassDistillationReplenishmentGaps,
  massDistillationThroughputProfile,
} from '../lib/ai/cos/cosUniversityDistillationCurriculumPlan.ts'
import {
  MASS_DISTILLATION_ROLLING_BATCHES_PER_CAMPAIGN,
  MASS_DISTILLATION_ROLLING_MAX_AUTHORIZED_COST_USD,
} from '../lib/ai/cos/cosUniversityMassDistillationRollingAuthorization.ts'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('distillation throughput is deployment-owner controlled without a vendor clamp', () => {
  assert.equal(MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES, 5)
  assert.equal(MASS_DISTILLATION_DEFAULT_PREPARED_BATCH_BUFFER_TARGET, 10)
  assert.equal(MASS_DISTILLATION_DEFAULT_QUERIES_PER_SUBJECT, 3)
  const defaults = massDistillationThroughputProfile({})
  assert.equal(defaults.preparedBatchBufferTarget, 10)
  assert.equal(defaults.queriesPerSubject, 3)
  const enterprise = massDistillationThroughputProfile({
    DISTILLATION_PREPARED_BUFFER_TARGET: '5000',
    DISTILLATION_TARGET_SUBJECTS: '250',
    DISTILLATION_QUERIES_PER_SUBJECT: '1000',
    DISTILLATION_ACQUISITION_CANDIDATES_PER_CYCLE: '100000',
    DISTILLATION_CORPUS_SCAN_ROWS: '5000000',
    DISTILLATION_MAX_BATCHES_PER_SWEEP: '25000',
  })
  assert.equal(enterprise.preparedBatchBufferTarget, 5000)
  assert.equal(enterprise.targetSubjectsPerReplenishment, 250)
  assert.equal(enterprise.queriesPerSubject, 1000)
  assert.equal(enterprise.acquisitionCandidatesPerCycle, 100000)
  assert.equal(enterprise.corpusScanRows, 5000000)
  assert.equal(enterprise.maxBatchesPerSweep, 25000)
})

test('replenishment issues multiple distinct scholarly queries instead of repeating one saturated result set', () => {
  const gaps = buildMassDistillationReplenishmentGaps([
    {
      subjectKey: 'economics_finance',
      subject: 'Economics & Finance',
      canonicalSubjectId: 'economics_finance',
      uniqueBatchableItems: 17,
      shortfallToBatch: 3,
    },
  ], new Date('2026-09-16T18:10:00.000Z'), 1, 3)
  assert.equal(gaps.length, 3)
  assert.equal(new Set(gaps.map(gap => gap.id)).size, 3)
  assert.equal(new Set(gaps.map(gap => gap.discoveryQuery)).size, 3)
  assert.ok(gaps.every(gap => gap.sourceKinds?.length === 1 && gap.sourceKinds[0] === 'scientific_journal'))
  assert.ok(gaps.every(gap => gap.evidence.some(item => item.startsWith('query_variant='))))
})

test('ready-inventory replenishment runs before paid authorization and may overlap budget pauses', () => {
  const workflow = source('../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts')
  const packageAt = workflow.indexOf('prepareUniversityMassDistillationCurriculum(now')
  const inventoryAt = workflow.indexOf('preparedMassDistillationInventory(preparedBufferTarget)')
  const replenishAt = workflow.indexOf('replenishUniversityMassDistillationCurriculum')
  const authorizeAt = workflow.indexOf('authorizeNextUniversityMassDistillationCampaign()')
  assert.ok(packageAt > 0)
  assert.ok(inventoryAt > packageAt)
  assert.ok(replenishAt > 0)
  assert.ok(authorizeAt > inventoryAt)
  assert.match(workflow, /preparedBeforeReplenishment < preparedBufferTarget/)
  assert.match(workflow, /throughput\.targetSubjectsPerReplenishment/)
  assert.match(workflow, /throughput\.queriesPerSubject/)
  assert.match(workflow, /throughput\.acquisitionCandidatesPerCycle/)
  assert.match(workflow, /throughput\.corpusScanRows/)
  assert.match(workflow, /throughput\.maxBatchesPerSweep/)
})

test('owner throughput control remains separate from University spending and authority', () => {
  assert.equal(MASS_DISTILLATION_ROLLING_MAX_AUTHORIZED_COST_USD, null)
  assert.equal(MASS_DISTILLATION_ROLLING_BATCHES_PER_CAMPAIGN, 1)
  const replenishment = source('../lib/ai/cos/cosUniversityDistillationCurriculumReplenishment.ts')
  assert.match(replenishment, /maxExternalCostUsdPerCycle:\s*0/)
  assert.match(replenishment, /allowedSourceKinds:\s*new Set\(\['scientific_journal'\]\)/)
  assert.match(replenishment, /minimumConfidence:\s*0\.80/)
  assert.match(replenishment, /DISTILLATION_OPENALEX_RESULTS_PER_QUERY = 10/)
  const packaging = source('../lib/ai/cos/cosUniversityMassDistillation.ts')
  assert.doesNotMatch(packaging, /Math\.min\(100,\s*Math\.floor\(maxBatches\)\)/)
})

test('replenishment keeps acquiring when every canonical subject was just consumed into batches', () => {
  // Production 2026-09-16 19:43-20:12 local: only non-canonical subjects remained, replenishment reported
  // no_targetable_subject_shortfall and Hugging Face idled with zero prepared batches.
  const gaps = buildMassDistillationReplenishmentGaps([
    { subjectKey: 'incident triage', subject: 'incident triage', canonicalSubjectId: null, uniqueBatchableItems: 4, shortfallToBatch: 16 },
  ], new Date('2026-09-16T23:12:00.000Z'), 3, 1)
  assert.equal(gaps.length, 3)
  assert.equal(new Set(gaps.map(gap => gap.subject)).size, 3)
  assert.ok(gaps.every(gap => gap.sourceKinds?.length === 1 && gap.sourceKinds[0] === 'scientific_journal'))
  assert.ok(gaps.every(gap => gap.evidence.includes('shortfall_to_batch=20')))
})

test('empty canonical subjects rotate between slots instead of always asking the same three', () => {
  const at = (iso: string) => buildMassDistillationReplenishmentGaps([], new Date(iso), 3, 1).map(gap => gap.subject).join('|')
  assert.notEqual(at('2026-09-16T23:10:00.000Z'), at('2026-09-16T23:15:00.000Z'))
})
