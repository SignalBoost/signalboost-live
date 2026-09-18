import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningDirector, type ContinuousLearningPolicy } from '@/lib/cos-core/layers/learning'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { createSupabaseCOSStores, cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { MassDistillationSubjectSupply } from './cosUniversityMassDistillation.ts'
import {
  buildMassDistillationReplenishmentGaps,
  MASS_DISTILLATION_DEFAULT_QUERIES_PER_SUBJECT,
  MASS_DISTILLATION_REPLENISHMENT_INTERVAL_MINUTES,
} from './cosUniversityDistillationCurriculumPlan.ts'
import {
  HYBRID_DISTILLATION_PROFILE,
  HYBRID_FAILURE_DERIVED_TARGET,
  failureDerivedSourceHash,
  teacherSyntheticSourceHash,
} from './cosUniversityHybridDistillation.ts'

const DISTILLATION_OPENALEX_RESULTS_PER_QUERY = 10
const HYBRID_SYNTHETIC_MAX_PER_SUBJECT = 20
const HYBRID_FAILURE_DERIVED_MAX_PER_SUBJECT = Math.max(1, Math.round(20 * HYBRID_FAILURE_DERIVED_TARGET))
const VERIFIED_FAILURE_LOOKBACK_DAYS = 30

function rightsClearedPolicy(maxCandidatesPerCycle: number): ContinuousLearningPolicy {
  return {
    allowedSourceKinds: new Set(['scientific_journal']),
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

async function installVerifiedFailureDerivedCurriculum(input: {
  db: NonNullable<ReturnType<typeof cosServiceDb>>
  supply: readonly MassDistillationSubjectSupply[]
  now: Date
  maxSubjects: number
}) {
  const since = new Date(input.now.getTime() - VERIFIED_FAILURE_LOOKBACK_DAYS * 86_400_000).toISOString()
  const targets = [...input.supply]
    .filter(subject => subject.shortfallToBatch > 0)
    .sort((a, b) => a.shortfallToBatch - b.shortfallToBatch || a.subject.localeCompare(b.subject))
    .slice(0, input.maxSubjects)
  const targetTitles = new Set(targets.map(subject => subject.subject))

  const rows = await input.db.from('cos_university_distilled_evaluation_runs')
    .select('candidate_id,subject_id,holdout_improved,safety_passed,unseen_transfer_passed,delayed_retention_passed,created_at')
    .gte('created_at', since)
    .eq('holdout_improved', false)
    .order('created_at', { ascending: false })
    .limit(500)
  if (rows.error) throw rows.error

  const failuresByTitle = new Map<string, number>()
  for (const row of (rows.data || []) as any[]) {
    const subject = String(row.subject_id || '').trim()
    if (!targetTitles.has(subject)) continue
    // Independent evaluator verdict is the failure signal. Safety/transfer/retention remain separate
    // gates and are deliberately not weakened or reinterpreted here.
    failuresByTitle.set(subject, (failuresByTitle.get(subject) || 0) + 1)
  }

  let inserted = 0
  const bySubject: Array<{ subject: string; inserted: number }> = []
  for (const target of targets) {
    const verifiedFailures = failuresByTitle.get(target.subject) || 0
    const needed = Math.min(
      HYBRID_FAILURE_DERIVED_MAX_PER_SUBJECT,
      verifiedFailures,
      Math.max(0, target.shortfallToBatch),
    )
    let subjectInserted = 0
    for (let ordinal = 0; ordinal < needed; ordinal += 1) {
      const contentHash = failureDerivedSourceHash(target.subject, ordinal)
      const row = {
        content_hash: contentHash,
        source_kind: 'failure_derived_curriculum',
        source_uri: `itmounts://cos-university/failure-derived/${encodeURIComponent(target.subject)}/${ordinal}`,
        source_title: `${target.subject} — independently verified remediation seed ${ordinal + 1}`,
        observed_at: input.now.toISOString(),
        subject: target.subject,
        summary: [
          `Independent holdout evaluation shows a remediation need in ${target.subject}.`,
          'Generate a distinct self-contained expert teaching example that targets a common failure mode in this subject and demonstrates the corrected method.',
          'Do not reproduce training examples, raw conversations, private holdouts, hidden exams, evaluator output, user data, or private evidence.',
        ].join(' '),
        facts: [
          { origin: 'failure_derived', profile: HYBRID_DISTILLATION_PROFILE, ordinal },
          { constraint: 'subject_level_remediation_only_no_raw_chat_no_private_holdout_no_hidden_exam' },
        ],
        confidence: 1,
        license: 'synthetic-benchmark-fixture',
        evidence: [{
          profile: HYBRID_DISTILLATION_PROFILE,
          origin: 'failure_derived',
          independentEvaluationFailure: true,
          sourceDetailsCopied: false,
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

  for (const target of targets) {
    const needed = Math.min(HYBRID_SYNTHETIC_MAX_PER_SUBJECT, Math.max(0, target.shortfallToBatch))
    let subjectInserted = 0
    for (let ordinal = 0; ordinal < needed; ordinal += 1) {
      const contentHash = teacherSyntheticSourceHash(target.subject, ordinal)
      const row = {
        content_hash: contentHash,
        source_kind: 'teacher_synthetic_curriculum',
        source_uri: `itmounts://cos-university/hybrid-distillation/${encodeURIComponent(target.subject)}/${ordinal}`,
        source_title: `${target.subject} — teacher-generated practice seed ${ordinal + 1}`,
        observed_at: input.now.toISOString(),
        subject: target.subject,
        summary: [
          `Teacher-synthetic curriculum seed for ${target.subject}.`,
          `Generate a distinct, self-contained expert teaching example for this subject (variant ${ordinal + 1}).`,
          'Prefer a concept, diagnostic problem, counterexample, or applied decision that is meaningfully different from neighboring variants.',
          'The teacher must not claim current-web access, private context, hidden exams, user memories, or external citations.',
        ].join(' '),
        facts: [
          { origin: 'teacher_synthetic', profile: HYBRID_DISTILLATION_PROFILE, ordinal },
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
  const gaps = buildMassDistillationReplenishmentGaps(input.supply, now, maxSubjects, queriesPerSubject)
  if (!gaps.length) return Object.freeze({ ok: true, skipped: true, reason: 'no_targetable_subject_shortfall', targets: [], externalCostUsd: 0 })

  const db = cosServiceDb()
  const stores = createSupabaseCOSStores()
  if (!db || !stores?.continuousLearning) throw new Error('persistent_learning_store_unavailable')

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

  const adapters = createLiveLearningAdapters({
    ...process.env,
    COS_LEARNING_CAP_OPENALEX: String(DISTILLATION_OPENALEX_RESULTS_PER_QUERY),
  }).filter(adapter => adapter.id === 'openalex')
  if (!adapters.length) {
    await db.from('cos_university_continuous_runs').update({
      status: 'error', errors: ['rights_cleared_openalex_adapter_unavailable'], completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', claim.data.id)
    return Object.freeze({ ok: false, skipped: false, reason: 'rights_cleared_openalex_adapter_unavailable', slotKey: key, targets: gaps.map(gap => gap.subject), externalCostUsd: 0 })
  }

  try {
    const cycle = new ContinuousLearningCycle(
      new ContinuousLearningDirector(stores.continuousLearning, rightsClearedPolicy(maxCandidatesPerCycle)),
      adapters,
    )
    const result = await cycle.run(gaps, 0)

    // Real rights-cleared acquisition remains first. Verified failures add subject-level remediation
    // seeds without copying raw chats or hidden evaluator material. Synthetic fallback fills the rest.
    const failureDerived = await installVerifiedFailureDerivedCurriculum({ db, supply: input.supply, now, maxSubjects })
    const synthetic = await installTeacherSyntheticFallback({ db, supply: input.supply, now, maxSubjects })

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
      maxCandidatesPerCycle,
      documentsAcquired: result.documentsAcquired,
      accepted: result.accepted,
      probationary: result.probationary,
      rejected: result.rejected,
      sourceErrors: result.sourceErrors,
      failureDerivedInserted: failureDerived.inserted,
      failureDerivedBySubject: failureDerived.bySubject,
      syntheticInserted: synthetic.inserted,
      syntheticBySubject: synthetic.bySubject,
      sourceMix: ['real_source', 'failure_derived', 'teacher_synthetic'],
      externalCostUsd: 0,
      semantics: 'real_rights_cleared_material_first_then_verified_failure_subject_remediation_then_teacher_synthetic_shortfall_no_raw_chat_no_hidden_exam_no_training_dispatch',
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
