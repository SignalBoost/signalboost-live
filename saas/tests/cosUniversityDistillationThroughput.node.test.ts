// saas/tests/cosUniversityDistillationThroughput.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MASS_DISTILLATION_DEFAULT_PREPARED_BATCH_BUFFER_TARGET,
  MASS_DISTILLATION_DEFAULT_QUERIES_PER_SUBJECT,
  MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES,
  MASS_DISTILLATION_REPLENISHMENT_BATCH_ITEMS,
  buildMassDistillationOpenSourceMaintenanceGaps,
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
  assert.ok(gaps.every(gap => gap.sourceKinds?.includes('scientific_journal') && gap.sourceKinds?.includes('public_dataset')))
  assert.ok(gaps.every(gap => gap.evidence.some(item => item.startsWith('query_variant='))))
})

test('paid authorization and dispatch precede slower ready-inventory maintenance', () => {
  const workflow = source('../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts')
  const packageAt = workflow.indexOf('prepareUniversityMassDistillationCurriculum(now')
  const inventoryAt = workflow.indexOf('preparedMassDistillationInventory(preparedBufferTarget)')
  const replenishAt = workflow.indexOf('replenishUniversityMassDistillationCurriculum')
  const authorizeAt = workflow.indexOf('authorizeAvailableUniversityMassDistillationCampaigns()')
  assert.ok(packageAt > 0)
  assert.ok(authorizeAt > 0)
  assert.ok(authorizeAt < packageAt)
  assert.ok(inventoryAt > packageAt)
  assert.ok(replenishAt > 0)
  assert.match(workflow, /preparedBeforeReplenishment >= preparedBufferTarget/)
  assert.match(workflow, /installVerifiedFailureDerivedCurriculum/)
  assert.match(workflow, /failure_derived_remediation_seeded_with_prepared_buffer_satisfied/)
  assert.match(workflow, /throughput\.targetSubjectsPerReplenishment/)
  assert.match(workflow, /throughput\.queriesPerSubject/)
  assert.match(workflow, /throughput\.acquisitionCandidatesPerCycle/)
  assert.match(workflow, /throughput\.corpusScanRows/)
  assert.match(workflow, /throughput\.maxBatchesPerSweep/)
  assert.match(workflow, /slowMaintenanceDue = input\.source === 'self_healing_supervisor' \|\| now\.getUTCMinutes\(\) % 5 === 0/)
  assert.match(workflow, /slowMaintenanceDue[\s\S]*campaign_recovery/)
  assert.match(workflow, /slowMaintenanceDue[\s\S]*semantic_reconciliation/)
  assert.match(workflow, /reason: 'maintenance_not_due'/)
  assert.match(workflow, /replenishmentMaterialInserted/)
  assert.match(workflow, /curriculumReplenishment\.hostedTeacherInserted/)
  assert.match(workflow, /curriculumReplenishment\.syntheticInserted/)
  assert.match(workflow, /if \(replenishmentMaterialInserted > 0\)/)
  assert.match(workflow, /maintainUniversityRightsClearedOpenSourceCorpus/)
  assert.match(workflow, /openSourceMaintenance/)
  assert.match(workflow, /full prepared-job buffer[\s\S]*must never stop learning/i)
})

test('owner throughput control remains separate from University spending and authority', () => {
  assert.equal(MASS_DISTILLATION_ROLLING_MAX_AUTHORIZED_COST_USD, null)
  assert.equal(MASS_DISTILLATION_ROLLING_BATCHES_PER_CAMPAIGN, 1)
  const replenishment = source('../lib/ai/cos/cosUniversityDistillationCurriculumReplenishment.ts')
  assert.match(replenishment, /maxExternalCostUsdPerCycle:\s*0/)
  assert.match(replenishment, /allowedSourceKinds:\s*new Set\(\['scientific_journal', 'public_dataset'\]\)/)
  assert.match(replenishment, /minimumConfidence:\s*0\.80/)
  assert.match(replenishment, /DISTILLATION_OPENALEX_RESULTS_PER_QUERY = 10/)
  assert.match(replenishment, /DISTILLATION_OPEN_DATA_RESULTS_PER_QUERY = 10/)
  assert.match(replenishment, /DISTILLATION_SOURCE_CALL_BUDGET_MULTIPLIER = 6/)
  assert.match(replenishment, /hf_nist_cc0/)
  assert.match(replenishment, /hf_github_cc0/)
  assert.doesNotMatch(replenishment, /\.filter\(adapter => adapter\.id === 'openalex'\)/)
  const maintenanceStart = replenishment.indexOf('export async function maintainUniversityRightsClearedOpenSourceCorpus')
  const remediationStart = replenishment.indexOf('export async function installVerifiedFailureDerivedCurriculum')
  assert.ok(maintenanceStart > 0 && remediationStart > maintenanceStart)
  const maintenance = replenishment.slice(maintenanceStart, remediationStart)
  assert.match(maintenance, /maxExternalCostUsdPerCycle|rightsClearedPolicy/)
  assert.doesNotMatch(maintenance, /installHostedTeacherCurriculum/)
  assert.doesNotMatch(maintenance, /installTeacherSyntheticFallback/)
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
  assert.ok(gaps.every(gap => gap.sourceKinds?.includes('scientific_journal') && gap.sourceKinds?.includes('public_dataset')))
  assert.ok(gaps.every(gap => gap.evidence.includes(`shortfall_to_batch=${MASS_DISTILLATION_REPLENISHMENT_BATCH_ITEMS}`)))
})

test('shortage fallback stays planner-scoped while failure remediation sees all failing supplied subjects', () => {
  const replenishment = source('../lib/ai/cos/cosUniversityDistillationCurriculumReplenishment.ts')
  assert.ok(replenishment.includes('const plannedSubjects = [...new Set(gaps.map(gap => gap.subject))]'))
  assert.ok(replenishment.includes('const replenishmentSupply: MassDistillationSubjectSupply[] = plannedSubjects.map'))
  assert.ok(replenishment.includes('shortfallToBatch: MASS_DISTILLATION_REPLENISHMENT_BATCH_ITEMS'))
  assert.ok(replenishment.includes('for (const item of input.supply) remediationSupplyBySubject.set(item.subject, item)'))
  assert.ok(replenishment.includes('for (const item of replenishmentSupply) remediationSupplyBySubject.set(item.subject, item)'))
  assert.ok(replenishment.includes('installVerifiedFailureDerivedCurriculum({ db, supply: remediationSupply'))
  assert.ok(replenishment.includes('installHostedTeacherCurriculum({ db, supply: replenishmentSupply'))
  assert.ok(replenishment.includes('installTeacherSyntheticFallback({ db, supply: replenishmentSupply'))
  // Cost-bearing hosted calls remain separately fail-closed; this handoff does not grant budget.
  const hostedTeacher = source('../lib/ai/cos/cosUniversityHostedTeacherCurriculum.ts')
  assert.match(hostedTeacher, /COS_UNIVERSITY_TEACHER_HOSTED_MAX_CALLS_PER_CYCLE/)
  assert.match(hostedTeacher, /if \(maxCalls === 0\)/)
})

test('empty canonical subjects rotate between slots instead of always asking the same three', () => {
  const at = (iso: string) => buildMassDistillationReplenishmentGaps([], new Date(iso), 3, 1).map(gap => gap.subject).join('|')
  assert.notEqual(at('2026-09-16T23:10:00.000Z'), at('2026-09-16T23:15:00.000Z'))
})


test('full prepared buffer still plans bounded rights-cleared source harvesting', () => {
  const gaps = buildMassDistillationOpenSourceMaintenanceGaps(new Date('2026-09-24T15:50:00Z'), 3, 1)
  assert.equal(gaps.length, 3)
  assert.ok(gaps.some(gap => gap.subject === 'Computer Science & Coding'))
  assert.ok(gaps.some(gap => gap.subject === 'Cybersecurity'))
  assert.ok(gaps.every(gap => gap.evidence.includes('prepared_buffer_does_not_stop_free_acquisition')))
  assert.ok(gaps.every(gap => gap.sourceKinds?.includes('scientific_journal') && gap.sourceKinds?.includes('public_dataset')))
})


test('rolling authorization prioritizes prepared batches containing failure-derived curriculum hashes', () => {
  const migration = source('../supabase/migrations/20260918023000_prioritize_failure_derived_distillation_batches.sql')
  assert.match(migration, /source_kind = 'failure_derived_curriculum'/)
  assert.match(migration, /cl\.content_hash = any\(b\.source_hashes\)/)
  assert.match(migration, /case when exists[\s\S]*then 0 else 1 end,[\s\S]*b\.prepared_at asc/)
  assert.match(migration, /v_active_campaigns >= v_policy\.max_concurrent_campaigns or v_unsettled_jobs > 0/)
  assert.match(migration, /automaticPromotionAuthorized',false,'runpodMutationAuthorized',false,'authorityExpanded',false/)
})


test('replenishment keeps the canonical subject at the front of bounded OpenAlex discovery', () => {
  const gaps = buildMassDistillationReplenishmentGaps([
    {
      subjectKey: 'cybersecurity',
      subject: 'Cybersecurity',
      canonicalSubjectId: 'cybersecurity',
      uniqueBatchableItems: 1,
      shortfallToBatch: 19,
    },
  ], new Date('2026-09-20T23:20:00Z'), 1, 3)

  assert.equal(gaps.length, 3)
  assert.ok(gaps.every(gap => gap.discoveryQuery?.startsWith('Cybersecurity ')))
  assert.ok(gaps.every(gap => (gap.discoveryQuery || '').split(/\s+/).slice(0, 8).some(term => /cybersecurity/i.test(term))))
})


test('corrective mass batches preserve five independent non-failure holdout sources before dispatch', () => {
  const packager = source('../lib/ai/cos/cosUniversityMassDistillation.ts')
  const migration = source('../supabase/migrations/20260925231000_mass_remediation_holdout_admission.sql')
  assert.match(packager, /HYBRID_INDEPENDENT_HOLDOUT_MIN/)
  assert.match(packager, /selectedFailureDerived >= 20 && selectedIndependent < HYBRID_INDEPENDENT_HOLDOUT_MIN/)
  assert.match(migration, /source_kind = 'failure_derived_curriculum'/)
  assert.match(migration, /source_kind <> 'failure_derived_curriculum'/)
  assert.match(migration, />= 5/)
  assert.match(migration, /set status = 'quarantined'/)
})


test('open-source maintenance uses the owner throughput profile instead of starving real-source diversity', () => {
  assert.match(workflow, /maxSubjects: Math\.max\(6, throughput\.targetSubjectsPerReplenishment\)/)
  assert.match(workflow, /queriesPerSubject: throughput\.queriesPerSubject/)
  assert.match(workflow, /maxCandidatesPerCycle: throughput\.acquisitionCandidatesPerCycle/)
  assert.doesNotMatch(workflow, /queriesPerSubject: 1,[\s\S]{0,120}maxCandidatesPerCycle: Math\.min\(20/)
})
