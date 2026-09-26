// saas/lib/ai/cos/cosUniversityDistillationCurriculumReplenishment.ts
import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningDirector, type ContinuousLearningPolicy } from '@/lib/cos-core/layers/learning'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { createSupabaseCOSStores, cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { MassDistillationSubjectSupply } from './cosUniversityMassDistillation.ts'
import { installHostedTeacherCurriculum } from './cosUniversityHostedTeacherCurriculum.ts'
import { COS_UNIVERSITY_SUBJECTS } from './cosUniversity.ts'
import {
  buildMassDistillationOpenSourceMaintenanceGaps,
  buildMassDistillationReplenishmentGaps,
  MASS_DISTILLATION_DEFAULT_QUERIES_PER_SUBJECT,
  MASS_DISTILLATION_REPLENISHMENT_BATCH_ITEMS,
  MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES,
} from './cosUniversityDistillationCurriculumPlan.ts'
import {
  FAILURE_DERIVED_REMEDIATION_PROFILE,
  HYBRID_DISTILLATION_PROFILE,
  HYBRID_FAILURE_DERIVED_TARGET,
  failedEvaluationRemediationGates,
  failureDerivedPracticeVariant,
  failureDerivedRemediationPrinciples,
  failureDerivedSourceHash,
  teacherSyntheticSourceHash,
  type FailureDerivedRemediationGate,
} from './cosUniversityHybridDistillation.ts'

const DISTILLATION_OPENALEX_RESULTS_PER_QUERY = 10
const DISTILLATION_OPEN_DATA_RESULTS_PER_QUERY = 10
const DISTILLATION_SOURCE_CALL_BUDGET_MULTIPLIER = 6
const DISTILLATION_RIGHTS_CLEARED_ADAPTERS = new Set(['openalex', 'hf_nist_cc0', 'hf_github_cc0'])
const HYBRID_SYNTHETIC_MAX_PER_SUBJECT = 20
// A remediation source family must be able to satisfy the unchanged 20-unique-item packaging floor on its
// own when older real-source material is already assigned to durable batches. The hybrid packager still
// prefers the 30% failure-derived target when other unassigned material exists; this is a replenishment
// ceiling, not a required mix or a weakened quality gate.
const HYBRID_FAILURE_DERIVED_MAX_PER_SUBJECT = 20
const VERIFIED_FAILURE_LOOKBACK_DAYS = 30

function rightsClearedPolicy(maxCandidatesPerCycle: number): ContinuousLearningPolicy {
  return {
    allowedSourceKinds: new Set(['scientific_journal', 'public_dataset']),
    minimumConfidence: 0.80,
    maxCandidatesPerCycle,
    maxExternalCostUsdPerCycle: 0,
  }
}

function slotKey(now: Date): string {
  const interval = MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES * 60_000
  const slot = new Date(Math.floor(now.getTime() / interval) * interval)
  return `distillation-replenishment-${slot.toISOString().slice(0, 16).replace(/[-:T]/g, '')}`
}

function openSourceMaintenanceSlotKey(now: Date): string {
  const interval = MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES * 60_000
  const slot = new Date(Math.floor(now.getTime() / interval) * interval)
  return `distillation-open-source-maintenance-${slot.toISOString().slice(0, 16).replace(/[-:T]/g, '')}`
}

function rightsClearedDistillationAdapters() {
  return createLiveLearningAdapters({
    ...process.env,
    COS_LEARNING_CAP_OPENALEX: String(DISTILLATION_OPENALEX_RESULTS_PER_QUERY),
    COS_LEARNING_CAP_HF_NIST: String(DISTILLATION_OPEN_DATA_RESULTS_PER_QUERY),
    COS_LEARNING_CAP_HF_GITHUB_CC0: String(DISTILLATION_OPEN_DATA_RESULTS_PER_QUERY),
    COS_LEARNING_SOURCE_CALL_BUDGET_MULTIPLIER: String(DISTILLATION_SOURCE_CALL_BUDGET_MULTIPLIER),
  }).filter(adapter => Boolean(adapter.id && DISTILLATION_RIGHTS_CLEARED_ADAPTERS.has(adapter.id)))
}

export async function maintainUniversityRightsClearedOpenSourceCorpus(input: {
  now?: Date
  maxSubjects?: number
  queriesPerSubject?: number
  maxCandidatesPerCycle?: number
}) {
  const now = input.now || new Date()
  const maxSubjects = Number.isSafeInteger(input.maxSubjects) && Number(input.maxSubjects) > 0 ? Number(input.maxSubjects) : 3
  const queriesPerSubject = Number.isSafeInteger(input.queriesPerSubject) && Number(input.queriesPerSubject) > 0
    ? Number(input.queriesPerSubject)
    : 1
  const maxCandidatesPerCycle = Number.isSafeInteger(input.maxCandidatesPerCycle) && Number(input.maxCandidatesPerCycle) > 0
    ? Number(input.maxCandidatesPerCycle)
    : 20
  const db = cosServiceDb()
  if (!db) throw new Error('persistent_learning_store_unavailable')
  const stores = createSupabaseCOSStores()
  if (!stores?.continuousLearning) throw new Error('persistent_learning_store_unavailable')

  const gaps = buildMassDistillationOpenSourceMaintenanceGaps(now, maxSubjects, queriesPerSubject)
  if (!gaps.length) {
    return Object.freeze({ ok: true, skipped: true, reason: 'no_open_source_maintenance_gaps', externalCostUsd: 0 })
  }

  const key = openSourceMaintenanceSlotKey(now)
  const claim = await db.from('cos_university_continuous_runs').insert({
    slot_key: key,
    status: 'running',
    planned_count: gaps.length,
    eligible_count: gaps.length,
    gap_count: gaps.length,
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).select('id').maybeSingle()
  if (String((claim.error as { code?: string } | null)?.code || '') === '23505') {
    return Object.freeze({ ok: true, skipped: true, reason: 'open_source_maintenance_slot_already_claimed', slotKey: key, externalCostUsd: 0 })
  }
  if (claim.error) throw claim.error
  if (!claim.data?.id) throw new Error('open_source_maintenance_slot_claim_failed')

  const adapters = rightsClearedDistillationAdapters()
  if (!adapters.length) {
    const completedAt = new Date().toISOString()
    await db.from('cos_university_continuous_runs').update({
      status: 'error',
      errors: ['rights_cleared_distillation_adapters_unavailable'],
      completed_at: completedAt,
      updated_at: completedAt,
    }).eq('id', claim.data.id)
    return Object.freeze({ ok: false, skipped: false, reason: 'rights_cleared_distillation_adapters_unavailable', slotKey: key, externalCostUsd: 0 })
  }

  try {
    const cycle = new ContinuousLearningCycle(
      new ContinuousLearningDirector(stores.continuousLearning, rightsClearedPolicy(maxCandidatesPerCycle)),
      adapters,
    )
    const result = await cycle.run(gaps, 0)
    const completedAt = new Date().toISOString()
    const update = await db.from('cos_university_continuous_runs').update({
      status: 'completed',
      documents_acquired: result.documentsAcquired,
      accepted_count: result.accepted,
      probationary_count: result.probationary,
      rejected_counts: result.rejected,
      source_errors: result.sourceErrors,
      gap_diagnostics: result.gapDiagnostics,
      completed_at: completedAt,
      updated_at: completedAt,
    }).eq('id', claim.data.id)
    if (update.error) throw update.error

    return Object.freeze({
      ok: true,
      skipped: false,
      reason: result.accepted > 0 ? 'open_source_maintenance_retained' : 'open_source_maintenance_no_new_material',
      slotKey: key,
      targets: [...new Set(gaps.map(gap => gap.subject))],
      acquisitionAdapters: adapters.map(adapter => adapter.id).filter(Boolean),
      queryCount: gaps.length,
      maxCandidatesPerCycle,
      documentsAcquired: result.documentsAcquired,
      accepted: result.accepted,
      probationary: result.probationary,
      rejected: result.rejected,
      sourceErrors: result.sourceErrors,
      externalCostUsd: 0,
      semantics: 'prepared_buffer_never_stops_bounded_rights_cleared_open_source_acquisition_no_hosted_teacher_no_synthetic_fill',
    })
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error || 'unknown_error').slice(0, 800)
    const completedAt = new Date().toISOString()
    await db.from('cos_university_continuous_runs').update({
      status: 'error',
      errors: [message],
      completed_at: completedAt,
      updated_at: completedAt,
    }).eq('id', claim.data.id)
    throw error
  }
}

export async function installVerifiedFailureDerivedCurriculum(input: {
  db: NonNullable<ReturnType<typeof cosServiceDb>>
  supply: readonly MassDistillationSubjectSupply[]
  now: Date
  maxSubjects: number
}) {
  // Remediation used to be selected by curriculum SHORTAGE: only subjects whose inventory was too thin to form
  // a batch could receive failure-derived material, and the amount was capped by that shortfall. A subject with
  // healthy supply therefore received nothing no matter how many of its artifacts failed their gates - the loop
  // asked "is this subject short of material?" when the question is "did this subject's artifacts fail?".
  //
  // Production, current safety suite: 63 consecutive evaluations, every one pinned at 0.500 because the same two
  // safety cases fail for every artifact, while the remediation principles that address exactly those behaviours
  // existed and were never seeded for the subjects that were failing.
  //
  // Targets are now the subjects with verified failures, most-failing first, with shortfall only breaking ties.
  // Volume stays bounded: one full 20-variant corrective cohort per targeted subject/pass, at most maxSubjects
  // subjects. Variants round-robin across the verified failing artifacts and bind identity to candidate + failed
  // gate classes + ordinal, so the same evidence is idempotent while a newly failed artifact can replenish
  // corrective material after an earlier cohort has been consumed.
  const since = new Date(input.now.getTime() - VERIFIED_FAILURE_LOOKBACK_DAYS * 86_400_000).toISOString()

  const rows = await input.db.from('cos_university_distilled_evaluation_runs')
    .select('candidate_id,subject_id,holdout_improved,safety_passed,unseen_transfer_passed,delayed_retention_passed,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500)
  if (rows.error) throw rows.error

  const titleById = new Map(COS_UNIVERSITY_SUBJECTS.map(subject => [subject.id, subject.title] as const))
  const failuresByTitle = new Map<string, Array<{ candidateId: string; gates: readonly FailureDerivedRemediationGate[] }>>()
  for (const row of (rows.data || []) as any[]) {
    const rawSubject = String(row.subject_id || '').trim()
    const subject = titleById.get(rawSubject as any) || rawSubject
    const gates = failedEvaluationRemediationGates({
      holdoutImproved: row.holdout_improved,
      safetyPassed: row.safety_passed,
      unseenTransferPassed: row.unseen_transfer_passed,
      delayedRetentionPassed: row.delayed_retention_passed,
    })
    if (!gates.length) continue
    const candidateId = String(row.candidate_id || '').trim()
    if (!candidateId) continue
    const failures = failuresByTitle.get(subject) || []
    failures.push({ candidateId, gates })
    failuresByTitle.set(subject, failures)
  }

  // Select by failure, not by scarcity. A subject with no verified failure is never targeted, so this cannot
  // manufacture curriculum for a subject that is doing fine.
  // Build remediation targets from verified failures, not from the current supply snapshot. A newly
  // evaluated subject can be absent from supply after its prior batch was consumed; intersecting failures
  // with supply silently starves exactly the subject that needs corrective curriculum.
  const supplyByTitle = new Map(input.supply.map(subject => [subject.subject, subject] as const))
  const targets: MassDistillationSubjectSupply[] = [...failuresByTitle.keys()]
    .map(subjectTitle => {
      const supplied = supplyByTitle.get(subjectTitle)
      if (supplied) return supplied
      const canonical = COS_UNIVERSITY_SUBJECTS.find(subject => subject.title === subjectTitle)
      if (!canonical) return null
      return {
        subjectKey: canonical.id,
        subject: canonical.title,
        canonicalSubjectId: canonical.id,
        uniqueBatchableItems: 0,
        shortfallToBatch: MASS_DISTILLATION_REPLENISHMENT_BATCH_ITEMS,
      } satisfies MassDistillationSubjectSupply
    })
    .filter((subject): subject is MassDistillationSubjectSupply => subject !== null)
    .sort((a, b) => (failuresByTitle.get(b.subject) || []).length - (failuresByTitle.get(a.subject) || []).length
      || b.shortfallToBatch - a.shortfallToBatch
      || a.subject.localeCompare(b.subject))
    .slice(0, input.maxSubjects)

  let inserted = 0
  const bySubject: Array<{ subject: string; inserted: number }> = []
  for (const target of targets) {
    const verifiedFailures = failuresByTitle.get(target.subject) || []
    // The per-subject ceiling is a corrective COHORT size, not a count of failed artifacts.
    // Production showed 1-7 replay rows because this previously used verifiedFailures.length directly.
    // One independently verified failure is sufficient to synthesize twenty distinct general-principle
    // practice variants; multiple failures are round-robined so the cohort reflects the observed gate mix.
    const needed = verifiedFailures.length > 0 ? HYBRID_FAILURE_DERIVED_MAX_PER_SUBJECT : 0
    let subjectInserted = 0
    for (let ordinal = 0; ordinal < needed; ordinal += 1) {
      const failure = verifiedFailures[ordinal % verifiedFailures.length]
      if (!failure) continue
      // Bind remediation identity to the independently evaluated artifact + failed gate classes.
      // Re-running the same evidence is idempotent; a newly failed artifact produces fresh curriculum.
      const remediationKey = `${FAILURE_DERIVED_REMEDIATION_PROFILE}:${failure.candidateId}:${failure.gates.join(',')}`
      const contentHash = failureDerivedSourceHash(target.subject, ordinal, remediationKey)
      const remediationPrinciples = failureDerivedRemediationPrinciples(failure.gates)
      const remediationVariant = failureDerivedPracticeVariant({
        subjectId: target.subject,
        candidateId: failure.candidateId,
        ordinal,
        gates: failure.gates,
      })
      const row = {
        content_hash: contentHash,
        source_kind: 'failure_derived_curriculum',
        source_uri: `itmounts://cos-university/failure-derived/${encodeURIComponent(target.subject)}/${contentHash.slice(0, 16)}/${ordinal}`,
        source_title: `${target.subject} — independently verified remediation seed ${ordinal + 1}`,
        observed_at: input.now.toISOString(),
        subject: target.subject,
        summary: [
          `Independent evaluation shows a remediation need in ${target.subject} for graduation gate classes: ${failure.gates.join(', ')}.`,
          'Generate a distinct self-contained expert teaching example that targets the relevant failure class while preserving correct, safe, transferable, and retainable behavior.',
          `Remediation focus: ${remediationVariant.focus}. Practice context: ${remediationVariant.context}. Verification mode: ${remediationVariant.verificationMode}. Difficulty twist: ${remediationVariant.difficultyTwist}.`,
          `Variant-specific remediation requirements: ${remediationVariant.remediationRequirements.join(' ')}`,
          `General remediation principles: ${remediationPrinciples.join(' ')}`,
          'Use those general principles without recreating any hidden evaluation case. Do not reproduce training examples, raw conversations, private holdouts, hidden exams, evaluator output, user data, or private evidence.',
        ].join(' '),
        facts: [
          {
            origin: 'failure_derived',
            profile: HYBRID_DISTILLATION_PROFILE,
            remediationProfile: FAILURE_DERIVED_REMEDIATION_PROFILE,
            ordinal,
            remediationGates: failure.gates,
            remediationPrinciples,
            remediationVariant,
          },
          { constraint: 'subject_level_remediation_general_principles_only_no_raw_chat_no_private_holdout_no_hidden_exam' },
        ],
        confidence: 1,
        license: 'synthetic-benchmark-fixture',
        evidence: [{
          profile: HYBRID_DISTILLATION_PROFILE,
          remediationProfile: FAILURE_DERIVED_REMEDIATION_PROFILE,
          origin: 'failure_derived',
          independentEvaluationFailure: true,
          remediationGates: failure.gates,
          sourceEvaluationCandidateId: failure.candidateId,
          sourceDetailsCopied: false,
          authorityExpanded: false,
        }],
      }
      const write = await input.db.from('cos_continuous_learning')
        .upsert(row, { onConflict: 'content_hash', ignoreDuplicates: true })
        .select('content_hash')
      if (write.error) throw write.error
      const created = Array.isArray(write.data) && write.data.length > 0
      if (created) {
        inserted += 1
        subjectInserted += 1
      }
    }
    bySubject.push({ subject: target.subject, inserted: subjectInserted })
  }
  return Object.freeze({ inserted, bySubject: Object.freeze(bySubject) })
}

async function installTeacherSyntheticFallback(input: {
  db: NonNullable<ReturnType<typeof cosServiceDb>>
  supply: readonly MassDistillationSubjectSupply[]
  now: Date
  maxSubjects: number
}) {
  let inserted = 0
  const bySubject: Array<{ subject: string; inserted: number }> = []
  const targets = [...input.supply]
    .filter(subject => subject.shortfallToBatch > 0)
    .sort((a, b) => a.shortfallToBatch - b.shortfallToBatch || a.subject.localeCompare(b.subject))
    .slice(0, input.maxSubjects)

  const generationKey = slotKey(input.now)
  for (const target of targets) {
    const needed = Math.min(HYBRID_SYNTHETIC_MAX_PER_SUBJECT, Math.max(0, target.shortfallToBatch))
    let subjectInserted = 0
    for (let ordinal = 0; ordinal < needed; ordinal += 1) {
      const contentHash = teacherSyntheticSourceHash(target.subject, ordinal, generationKey)
      const row = {
        content_hash: contentHash,
        source_kind: 'teacher_synthetic_curriculum',
        source_uri: `itmounts://cos-university/hybrid-distillation/${encodeURIComponent(target.subject)}/${generationKey}/${ordinal}`,
        source_title: `${target.subject} — teacher-generated practice seed ${ordinal + 1} (${generationKey})`,
        observed_at: input.now.toISOString(),
        subject: target.subject,
        summary: [
          `Teacher-synthetic curriculum seed for ${target.subject}.`,
          `Generate a distinct, self-contained expert teaching example for this subject (variant ${ordinal + 1}).`,
          'Prefer a concept, diagnostic problem, counterexample, or applied decision that is meaningfully different from neighboring variants.',
          'The teacher must not claim current-web access, private context, hidden exams, user memories, or external citations.',
        ].join(' '),
        facts: [
          { origin: 'teacher_synthetic', profile: HYBRID_DISTILLATION_PROFILE, generationKey, ordinal },
          { constraint: 'self_contained_no_private_or_current_web_claims' },
        ],
        confidence: 1,
        license: 'synthetic-benchmark-fixture',
        evidence: [{
          profile: HYBRID_DISTILLATION_PROFILE,
          origin: 'teacher_synthetic',
          fallbackOnly: true,
          fillsPostDedupShortfall: true,
          authorityExpanded: false,
        }],
      }
      const write = await input.db.from('cos_continuous_learning')
        .upsert(row, { onConflict: 'content_hash', ignoreDuplicates: true })
      if (write.error) throw write.error
      inserted += 1
      subjectInserted += 1
    }
    bySubject.push({ subject: target.subject, inserted: subjectInserted })
  }

  return Object.freeze({ inserted, bySubject: Object.freeze(bySubject) })
}

export async function replenishUniversityMassDistillationCurriculum(input: {
  supply: readonly MassDistillationSubjectSupply[]
  now?: Date
  maxSubjects?: number
  queriesPerSubject?: number
  maxCandidatesPerCycle?: number
}) {
  const now = input.now || new Date()
  const maxSubjects = Number.isSafeInteger(input.maxSubjects) && Number(input.maxSubjects) > 0 ? Number(input.maxSubjects) : 3
  const queriesPerSubject = Number.isSafeInteger(input.queriesPerSubject) && Number(input.queriesPerSubject) > 0
    ? Number(input.queriesPerSubject)
    : MASS_DISTILLATION_DEFAULT_QUERIES_PER_SUBJECT
  const maxCandidatesPerCycle = Number.isSafeInteger(input.maxCandidatesPerCycle) && Number(input.maxCandidatesPerCycle) > 0
    ? Number(input.maxCandidatesPerCycle)
    : 40
  const db = cosServiceDb()
  if (!db) throw new Error('persistent_learning_store_unavailable')

  const gaps = buildMassDistillationReplenishmentGaps(input.supply, now, maxSubjects, queriesPerSubject)
  if (!gaps.length) {
    // Evaluation remediation is failure-driven, not inventory-driven. A subject can have a full curriculum
    // buffer and still repeatedly fail a graduation gate; that failure must remain able to seed bounded,
    // idempotent corrective curriculum even when OpenAlex/teacher replenishment has no shortage to fill.
    const failureDerived = await installVerifiedFailureDerivedCurriculum({ db, supply: input.supply, now, maxSubjects })
    const remediationTargets = failureDerived.bySubject.map(item => item.subject)
    return Object.freeze({
      ok: true,
      skipped: failureDerived.inserted === 0,
      reason: remediationTargets.length === 0
        ? 'no_targetable_subject_shortfall'
        : failureDerived.inserted > 0
          ? 'verified_failure_remediation_installed'
          : 'verified_failure_remediation_already_current',
      targets: remediationTargets,
      failureDerivedInserted: failureDerived.inserted,
      failureDerivedBySubject: failureDerived.bySubject,
      externalCostUsd: 0,
    })
  }

  // The planner deliberately rotates canonical subjects that have zero currently batchable items.
  // Those subjects do not exist in input.supply, so passing the raw supply to fallback installers
  // silently produced zero hosted/failure-derived/synthetic work after real-source saturation.
  // Reconstruct the exact unique planner targets here and use them for every fallback layer.
  const plannedSubjects = [...new Set(gaps.map(gap => gap.subject))]
  const replenishmentSupply: MassDistillationSubjectSupply[] = plannedSubjects.map(subjectTitle => {
    const existing = input.supply.find(item => item.subject === subjectTitle)
    if (existing) return existing
    const canonical = COS_UNIVERSITY_SUBJECTS.find(subject => subject.title === subjectTitle)
    if (!canonical) throw new Error(`mass_distillation_replenishment_subject_unmapped:${subjectTitle}`)
    return {
      subjectKey: canonical.id,
      subject: canonical.title,
      canonicalSubjectId: canonical.id,
      uniqueBatchableItems: 0,
      shortfallToBatch: MASS_DISTILLATION_REPLENISHMENT_BATCH_ITEMS,
    }
  })

  // Failure-derived remediation must consider every supplied subject with a verified failure, not only
  // the subjects selected by the current shortage planner. Shortage remains the boundary for OpenAlex
  // acquisition and teacher-synthetic fill, but never suppresses independently verified remediation.
  const remediationSupplyBySubject = new Map<string, MassDistillationSubjectSupply>()
  for (const item of input.supply) remediationSupplyBySubject.set(item.subject, item)
  for (const item of replenishmentSupply) remediationSupplyBySubject.set(item.subject, item)
  const remediationSupply = [...remediationSupplyBySubject.values()]

  const stores = createSupabaseCOSStores()
  if (!stores?.continuousLearning) throw new Error('persistent_learning_store_unavailable')

  const key = slotKey(now)
  const claim = await db.from('cos_university_continuous_runs').insert({
    slot_key: key,
    status: 'running',
    planned_count: gaps.length,
    eligible_count: gaps.length,
    gap_count: gaps.length,
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).select('id').maybeSingle()
  if (String((claim.error as { code?: string } | null)?.code || '') === '23505') {
    return Object.freeze({ ok: true, skipped: true, reason: 'replenishment_slot_already_claimed', slotKey: key, targets: gaps.map(gap => gap.subject), externalCostUsd: 0 })
  }
  if (claim.error) throw claim.error
  if (!claim.data?.id) throw new Error('replenishment_slot_claim_failed')

  // Mass distillation previously instantiated every live source and then discarded everything except
  // OpenAlex. That made the explicitly allowlisted CC0 Hugging Face corpora invisible to the replenisher,
  // while the generic one-call HF budget further limited yield when they were used elsewhere. Keep the
  // ordinary public-learning defaults unchanged, but give this bounded five-minute replenishment workflow
  // enough free calls to fill its own shortage targets. Admission, relevance, rights, dedup and cost gates
  // remain unchanged; arXiv metadata is intentionally excluded because its underlying paper rights are not
  // asserted for training.
  const adapters = rightsClearedDistillationAdapters()
  if (!adapters.length) {
    await db.from('cos_university_continuous_runs').update({
      status: 'error', errors: ['rights_cleared_distillation_adapters_unavailable'], completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', claim.data.id)
    return Object.freeze({ ok: false, skipped: false, reason: 'rights_cleared_distillation_adapters_unavailable', slotKey: key, targets: gaps.map(gap => gap.subject), externalCostUsd: 0 })
  }

  try {
    const cycle = new ContinuousLearningCycle(
      new ContinuousLearningDirector(stores.continuousLearning, rightsClearedPolicy(maxCandidatesPerCycle)),
      adapters,
    )
    const result = await cycle.run(gaps, 0)

    // Real rights-cleared acquisition remains first. Verified failures add subject-level remediation.
    // Explicitly enabled hosted teachers then generate real multi-provider synthetic curriculum in
    // parallel. The zero-cost placeholder fallback remains last so unavailable hosted providers can
    // never stop curriculum growth.
    const failureDerived = await installVerifiedFailureDerivedCurriculum({ db, supply: remediationSupply, now, maxSubjects })
    const hostedTeachers = await installHostedTeacherCurriculum({ db, supply: replenishmentSupply, now, maxSubjects })
    const synthetic = await installTeacherSyntheticFallback({ db, supply: replenishmentSupply, now, maxSubjects })

    const completedAt = new Date().toISOString()
    const update = await db.from('cos_university_continuous_runs').update({
      status: 'completed',
      documents_acquired: result.documentsAcquired,
      accepted_count: result.accepted,
      probationary_count: result.probationary,
      rejected_counts: result.rejected,
      source_errors: result.sourceErrors,
      gap_diagnostics: result.gapDiagnostics,
      completed_at: completedAt,
      updated_at: completedAt,
    }).eq('id', claim.data.id)
    if (update.error) throw update.error

    return Object.freeze({
      ok: true,
      skipped: false,
      slotKey: key,
      targets: [...new Set(gaps.map(gap => gap.subject))],
      queriesPerSubject,
      queryCount: gaps.length,
      resultsPerQuery: DISTILLATION_OPENALEX_RESULTS_PER_QUERY,
      openDataResultsPerQuery: DISTILLATION_OPEN_DATA_RESULTS_PER_QUERY,
      sourceCallBudgetMultiplier: DISTILLATION_SOURCE_CALL_BUDGET_MULTIPLIER,
      acquisitionAdapters: adapters.map(adapter => adapter.id).filter(Boolean),
      maxCandidatesPerCycle,
      documentsAcquired: result.documentsAcquired,
      accepted: result.accepted,
      probationary: result.probationary,
      rejected: result.rejected,
      sourceErrors: result.sourceErrors,
      failureDerivedInserted: failureDerived.inserted,
      failureDerivedBySubject: failureDerived.bySubject,
      hostedTeacherAttempted: hostedTeachers.attempted,
      hostedTeacherInserted: hostedTeachers.inserted,
      hostedTeacherProviders: hostedTeachers.activeProviders,
      hostedTeacherFailures: hostedTeachers.failures,
      syntheticInserted: synthetic.inserted,
      syntheticBySubject: synthetic.bySubject,
      sourceMix: ['real_source', 'failure_derived', 'hosted_teacher', 'teacher_synthetic'],
      externalCostUsd: hostedTeachers.attempted > 0 ? null : 0,
      externalCostMeasurement: hostedTeachers.attempted > 0
        ? 'provider_billed_external_cost_not_inferred_from_token_counts'
        : 'no_hosted_teacher_calls',
      semantics: 'real_rights_cleared_material_first_then_verified_failure_subject_remediation_then_explicitly_authorized_multi_provider_teacher_generation_then_zero_cost_synthetic_fallback_no_raw_chat_no_hidden_exam_no_silent_provider_fallback',
    })
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error || 'unknown_error').slice(0, 800)
    const completedAt = new Date().toISOString()
    await db.from('cos_university_continuous_runs').update({
      status: 'error', errors: [message], completed_at: completedAt, updated_at: completedAt,
    }).eq('id', claim.data.id)
    throw error
  }
}
