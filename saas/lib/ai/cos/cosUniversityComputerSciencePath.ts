// saas/lib/ai/cos/cosUniversityComputerSciencePath.ts
//
// The Computer Science path, as it stands right now (owner go 2026-10-06). Builder Residency is the only Step 1 blocker,
// and a change to Computer Science training shows up in Residency only after a newly trained artifact is dispatched,
// trained, admitted and given cases. The cohort report cannot show where that artifact is, so this snapshot reads the
// path end to end from durable tables:
//
//   packaging             Computer Science supply in the latest packaging pass, curriculum batches, and teaching rows by origin
//   training dispatches   latest Computer Science training dispatches and whether each carried Builder protocol practice
//                         (pre-dispatch assurance evidence, cos_university_learning_assurance_events)
//   training runs         latest Computer Science mass-distillation runs by stage, and the newest failed run's recorded
//                         failure_reason (cos_university_mass_distillation_batch_runs)
//   trained artifacts     latest Computer Science artifacts, their status, and whether their durable training receipt
//                         records protocol practice (cos_local_distillation_artifacts.intended_use.trainingReceipt)
//   Residency             artifacts waiting for admission, active residents, and the latest case runs with their times
//                         and whether the resident's loop stop was recorded (cos_university_residency_*)
//
// Read only: it is given a database handle and only selects. It never starts, wakes, admits or schedules anything.
import { BUILDER_PROTOCOL_PRACTICE_PROFILE } from './cosUniversityBuilderProtocolPractice.ts'
import { RESIDENCY_GAP_UNIVERSITY_SUBJECT } from './cosUniversityResidencyGapCurriculum.ts'

type Db = { from: (table: string) => any }

const SUBJECT = RESIDENCY_GAP_UNIVERSITY_SUBJECT
const RECENT = 20
const ARTIFACT_PAGE = 200
const PRE_DISPATCH_CLAIM = 'mass_distillation_pre_dispatch_validated'
const TRAINING_STAGE = 'training_dispatching'
const ADMISSION_STATUS = 'evaluation_ready'
const ACTIVE_STANDINGS = ['resident', 'senior_resident'] as const
const WORKFLOW_PATH = 'mass_distillation_campaign'
/** The packager's minimum batch (MASS_DISTILLATION_QUALITY_MIN_BATCH); repeated here to keep this reader light. */
const BATCH_MINIMUM = 64
const MIN_CONFIDENCE = 0.8
const FAILURE_DERIVED_KINDS = ['failure_derived_curriculum']
const TEACHER_SYNTHETIC_KINDS = ['teacher_synthetic_curriculum', 'teacher_hosted_curriculum']

const text = (value: unknown, max = 120): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const iso = (value: unknown): string | null => {
  const at = new Date(String(value ?? ''))
  return value && !Number.isNaN(at.getTime()) ? at.toISOString() : null
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const tally = (values: readonly string[]): Readonly<Record<string, number>> => {
  const out: Record<string, number> = {}
  for (const value of values) out[value] = (out[value] || 0) + 1
  return Object.freeze(Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))))
}

async function rows(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<any[]> {
  const result = await query
  if (result.error) throw result.error
  return Array.isArray(result.data) ? result.data : []
}

export type ComputerSciencePath = Readonly<{
  subjectId: string
  observedAt: string
  trainingDispatches: Readonly<{
    recent: number
    withPractice: number
    latestAt: string | null
    latestWithPractice: boolean | null
    latestPracticeTaskIds: readonly string[]
  }>
  packaging: Readonly<{
    /** The latest mass-distillation workflow receipt that recorded a packaging pass (supply is computed then only). */
    receiptAt: string | null
    /** Computer Science unique batchable items in that pass; null when the subject was absent (zero items). */
    supplyItems: number | null
    supplyShortfall: number | null
    /** Unused real-source items vs what a batch needs (half real-source); null on receipts written before it was recorded. */
    realSourceItems: number | null
    realSourceNeeded: number | null
    batchMinimum: number
    preparedBufferTarget: number | null
    preparedBefore: number | null
    replenishment: string | null
    curriculumBatchesByStatus: Readonly<Record<string, number>>
    latestCurriculumBatchAt: string | null
    /** Computer Science rows at mass-distillation confidence, by origin (the packager needs half real-source). */
    corpusRowsByOrigin: Readonly<{ realSource: number; failureDerived: number; teacherSynthetic: number }>
  }>
  trainingRuns: Readonly<{
    recent: number
    byStage: Readonly<Record<string, number>>
    latestStage: string | null
    latestAt: string | null
    /** The newest failed run's recorded failure_reason, so a failed training run is explained in the report. */
    latestFailureAt: string | null
    latestFailureReason: string | null
  }>
  trainedArtifacts: Readonly<{
    recent: number
    byStatus: Readonly<Record<string, number>>
    trainedWithPractice: number
    latestAt: string | null
    latestStatus: string | null
    latestWithPractice: boolean | null
  }>
  residency: Readonly<{
    awaitingAdmission: number
    awaitingAdmissionWithPractice: number
    activeResidents: number
    latestCaseStartedAt: string | null
    latestCaseCompletedAt: string | null
    latestCaseStatus: string | null
    recentCases: number
    recentFailedCases: number
    recentFailedCasesWithLoopStop: number
    /** Failed cases among the recent ones, by Residency case family (one family per exam variant), e.g. clamp_bounds_regression. */
    recentFailedByCaseFamily: Readonly<Record<string, number>>
  }>
}>

/**
 * What the fill step did in that pass. A fill that actually ran returns its result without a `reason` (2026-10-07: the
 * report printed "n/a" for it), so print its targets and yield: which subjects it searched for, documents acquired and
 * accepted, rejections by cause, and source errors. A skipped or failed fill prints its reason or error.
 */
function describeReplenishment(value: Record<string, unknown>): string | null {
  if (!Object.keys(value).length) return null
  if (value.ok === false) return `error:${text(value.error, 120) || text(value.reason, 120) || 'unknown'}`
  if (value.skipped === true) return `${text(value.reason, 120) || 'unspecified'} skipped`
  const count = (key: string) => Number.isFinite(Number(value[key])) ? Number(value[key]) : null
  const targets = Array.isArray(value.targets) ? (value.targets as unknown[]).map(item => text(item, 60)).filter(Boolean) : []
  // rejected and sourceErrors are both per-cause count maps (sourceErrors is LearningCycleResult's Record<source, n>).
  const counts = (map: unknown) => Object.entries(record(map))
    .filter(([, n]) => Number(n) > 0)
    .map(([cause, n]) => `${text(cause, 40)}=${Number(n)}`)
    .join(',')
  const rejectedText = counts(value.rejected)
  const sourceErrorsText = counts(value.sourceErrors)
  return [
    `ran targets=[${targets.join('; ') || 'none'}]`,
    `acquired=${count('documentsAcquired') ?? 'n/a'}`,
    `accepted=${count('accepted') ?? 'n/a'}`,
    `probationary=${count('probationary') ?? 'n/a'}`,
    `rejected=${rejectedText || 'none'}`,
    // "none" only when the fill recorded an empty map; a receipt without the field stays unknown (Codex on #3774).
    `sourceErrors=${sourceErrorsText || (value.sourceErrors && typeof value.sourceErrors === 'object' && !Array.isArray(value.sourceErrors) ? 'none' : 'n/a')}`,
    text(value.reason, 120) ? `reason=${text(value.reason, 120)}` : '',
  ].filter(Boolean).join(' ')
}

/** Read the Computer Science path as it stands now. Window-independent: it describes the present, not a cohort. */
export async function readComputerSciencePath(input: { db: Db; now?: Date }): Promise<ComputerSciencePath> {
  const db = input.db
  const now = input.now ?? new Date()

  const count = async (query: PromiseLike<{ count?: number | null; error: unknown }>): Promise<number> => {
    const result = await query
    if (result.error) throw result.error
    return Number(result.count ?? 0)
  }
  const corpus = () => db.from('cos_continuous_learning')
    .select('content_hash', { count: 'exact', head: true })
    .eq('subject', SUBJECT)
    .gte('confidence', MIN_CONFIDENCE)

  const [receiptRows, batchRows, corpusTotal, corpusFailure, corpusTeacher] = await Promise.all([
    rows(db.from('cos_university_learning_assurance_events')
      .select('observed_at,evidence')
      .eq('event_type', 'production_path')
      .eq('path_id', WORKFLOW_PATH)
      .not('evidence->curriculum->supply', 'is', null)
      .order('observed_at', { ascending: false })
      .limit(1)),
    rows(db.from('cos_university_distillation_curriculum_batches')
      .select('status,prepared_at')
      .eq('subject_id', SUBJECT)
      .order('prepared_at', { ascending: false })
      .limit(RECENT)),
    count(corpus()),
    count(corpus().in('source_kind', FAILURE_DERIVED_KINDS)),
    count(corpus().in('source_kind', TEACHER_SYNTHETIC_KINDS)),
  ])
  const receipt = receiptRows[0]
  const evidence = record(receipt?.evidence)
  const supplySubjects = Array.isArray(record(record(evidence.curriculum).supply).subjects)
    ? record(record(evidence.curriculum).supply).subjects as unknown[]
    : []
  const csSupply = record(supplySubjects.find(entry => {
    const item = record(entry)
    return item.canonicalSubjectId === 'computer_science' || text(item.subject, 240) === SUBJECT
  }))
  const replenishment = record(evidence.curriculumReplenishment)
  const number = (value: unknown): number | null => Number.isFinite(Number(value)) && value !== null && value !== undefined ? Number(value) : null

  const [dispatchRows, runRows, artifactRows, activeRows, caseRows] = await Promise.all([
    rows(db.from('cos_university_learning_assurance_events')
      .select('candidate_id,observed_at,evidence')
      .eq('subject_id', SUBJECT)
      .eq('evidence->>claim', PRE_DISPATCH_CLAIM)
      .eq('evidence->>stage', TRAINING_STAGE)
      .order('observed_at', { ascending: false })
      .limit(RECENT)),
    rows(db.from('cos_university_mass_distillation_batch_runs')
      .select('stage,failure_reason,created_at,updated_at')
      .eq('subject_id', SUBJECT)
      .order('created_at', { ascending: false })
      .limit(RECENT)),
    rows(db.from('cos_local_distillation_artifacts')
      .select('status,created_at,intended_use')
      .eq('subject_id', SUBJECT)
      .like('candidate_id', 'mass:%')
      .order('created_at', { ascending: false })
      .limit(RECENT)),
    rows(db.from('cos_university_residency_enrollments')
      .select('id')
      .in('standing', [...ACTIVE_STANDINGS])),
    rows(db.from('cos_university_residency_case_runs')
      .select('status,started_at,completed_at,metadata,case_family')
      .order('started_at', { ascending: false })
      .limit(RECENT)),
  ])

  const practiceOf = (row: any) => {
    const practice = record(record(row?.evidence).builderProtocolPractice)
    return practice.profile === BUILDER_PROTOCOL_PRACTICE_PROFILE ? practice : null
  }
  const latestDispatch = dispatchRows[0]
  const latestPractice = latestDispatch ? practiceOf(latestDispatch) : null

  const receiptPractice = (row: any) =>
    text(record(record(row?.intended_use).trainingReceipt).builderProtocolPracticeProfile, 120) === BUILDER_PROTOCOL_PRACTICE_PROFILE
  const recentArtifacts = artifactRows.slice(0, RECENT)
  const latestFailedRun = runRows.find(row => text(row.stage, 60) === 'failed')

  // Waiting means evaluation_ready and not yet enrolled in Builder Residency, read completely (the same queue the
  // admission station pages through), so an old waiting artifact is never hidden behind newer ones.
  const waiting: any[] = []
  for (let from = 0; ; from += ARTIFACT_PAGE) {
    const page = await rows(db.from('cos_local_distillation_artifacts')
      .select('id,intended_use')
      .eq('subject_id', SUBJECT)
      .eq('status', ADMISSION_STATUS)
      .like('candidate_id', 'mass:%')
      .order('created_at', { ascending: true })
      .range(from, from + ARTIFACT_PAGE - 1))
    waiting.push(...page)
    if (page.length < ARTIFACT_PAGE) break
  }
  const enrolledIds = new Set<string>()
  for (let index = 0; index < waiting.length; index += ARTIFACT_PAGE) {
    const enrolled = await rows(db.from('cos_university_residency_enrollments')
      .select('artifact_row_id')
      .in('artifact_row_id', waiting.slice(index, index + ARTIFACT_PAGE).map(row => text(row.id, 80))))
    for (const row of enrolled) enrolledIds.add(text(row.artifact_row_id, 80))
  }
  const awaiting = waiting.filter(row => !enrolledIds.has(text(row.id, 80)))

  const failedCases = caseRows.filter(row => text(row.status, 40) === 'failed')
  const withLoopStop = failedCases.filter(row => {
    const loop = record(record(row.metadata).builderLoop)
    return Boolean(text(loop.failureCode) || text(loop.outcome))
  })

  return Object.freeze({
    subjectId: SUBJECT,
    observedAt: now.toISOString(),
    trainingDispatches: Object.freeze({
      recent: dispatchRows.length,
      withPractice: dispatchRows.filter(row => practiceOf(row)).length,
      latestAt: iso(latestDispatch?.observed_at),
      latestWithPractice: latestDispatch ? Boolean(latestPractice) : null,
      latestPracticeTaskIds: Object.freeze(Array.isArray(latestPractice?.taskIds)
        ? (latestPractice!.taskIds as unknown[]).map(value => text(value, 80)).filter(Boolean).slice(0, 16)
        : []),
    }),
    packaging: Object.freeze({
      receiptAt: iso(receipt?.observed_at),
      supplyItems: receipt ? number(csSupply.uniqueBatchableItems) : null,
      supplyShortfall: receipt ? (number(csSupply.shortfallToBatch) ?? (Object.keys(csSupply).length ? null : BATCH_MINIMUM)) : null,
      realSourceItems: receipt ? number(csSupply.realSourceItems) : null,
      realSourceNeeded: receipt ? number(csSupply.realSourceNeeded) : null,
      batchMinimum: BATCH_MINIMUM,
      preparedBufferTarget: number(evidence.preparedBufferTarget),
      preparedBefore: number(evidence.preparedBeforeReplenishment),
      replenishment: receipt ? describeReplenishment(replenishment) : null,
      curriculumBatchesByStatus: tally(batchRows.map(row => text(row.status, 40) || 'unrecorded')),
      latestCurriculumBatchAt: iso(batchRows[0]?.prepared_at),
      corpusRowsByOrigin: Object.freeze({
        realSource: Math.max(0, corpusTotal - corpusFailure - corpusTeacher),
        failureDerived: corpusFailure,
        teacherSynthetic: corpusTeacher,
      }),
    }),
    trainingRuns: Object.freeze({
      recent: runRows.length,
      byStage: tally(runRows.map(row => text(row.stage, 60) || 'unrecorded')),
      latestStage: runRows[0] ? text(runRows[0].stage, 60) || null : null,
      latestAt: iso(runRows[0]?.updated_at ?? runRows[0]?.created_at),
      latestFailureAt: iso(latestFailedRun?.updated_at ?? latestFailedRun?.created_at),
      latestFailureReason: latestFailedRun ? text(latestFailedRun.failure_reason, 200) || 'unrecorded' : null,
    }),
    trainedArtifacts: Object.freeze({
      recent: recentArtifacts.length,
      byStatus: tally(recentArtifacts.map(row => text(row.status, 60) || 'unrecorded')),
      trainedWithPractice: recentArtifacts.filter(receiptPractice).length,
      latestAt: iso(recentArtifacts[0]?.created_at),
      latestStatus: recentArtifacts[0] ? text(recentArtifacts[0].status, 60) || null : null,
      latestWithPractice: recentArtifacts[0] ? receiptPractice(recentArtifacts[0]) : null,
    }),
    residency: Object.freeze({
      awaitingAdmission: awaiting.length,
      awaitingAdmissionWithPractice: awaiting.filter(receiptPractice).length,
      activeResidents: activeRows.length,
      latestCaseStartedAt: iso(caseRows[0]?.started_at),
      latestCaseCompletedAt: iso(caseRows[0]?.completed_at),
      latestCaseStatus: caseRows[0] ? text(caseRows[0].status, 40) || null : null,
      recentCases: caseRows.length,
      recentFailedCases: failedCases.length,
      recentFailedByCaseFamily: tally(failedCases.map(row => text(row.case_family, 80) || 'unrecorded')),
      recentFailedCasesWithLoopStop: withLoopStop.length,
    }),
  })
}

/** One plain block for the Step 1 report log. */
export function describeComputerSciencePath(path: ComputerSciencePath): string {
  const kv = (map: Readonly<Record<string, number>>) => Object.entries(map).map(([key, value]) => `${key}=${value}`).join(',') || 'none'
  const yes = (value: boolean | null) => value === null ? 'n/a' : value ? 'yes' : 'no'
  const d = path.trainingDispatches, r = path.trainingRuns, a = path.trainedArtifacts, s = path.residency, p = path.packaging
  const supply = p.receiptAt === null ? 'no packaging receipt'
    : p.supplyItems === null ? `absent from supply (0 batchable items; needs ${p.batchMinimum})`
      : `${p.supplyItems} batchable items (needs ${p.batchMinimum}; shortfall ${p.supplyShortfall ?? 'n/a'})`
        + ` realSource=${p.realSourceItems ?? 'not recorded'}/${p.realSourceNeeded ?? 'n/a'}`
        + (p.realSourceItems !== null && p.realSourceNeeded !== null && p.realSourceItems < p.realSourceNeeded ? ' BLOCKED: too little real-source material' : '')
  return [
    `COMPUTER SCIENCE PATH (now ${path.observedAt}; latest ${RECENT} of each)`,
    `  packaging           :: receiptAt=${p.receiptAt ?? 'none'} supply=${supply} preparedBuffer=${p.preparedBefore ?? 'n/a'}/${p.preparedBufferTarget ?? 'n/a'} replenishment=${p.replenishment ?? 'n/a'} curriculumBatches=${kv(p.curriculumBatchesByStatus)} latestBatchAt=${p.latestCurriculumBatchAt ?? 'none'} corpusRows(conf>=${MIN_CONFIDENCE}) real=${p.corpusRowsByOrigin.realSource} failureDerived=${p.corpusRowsByOrigin.failureDerived} teacherSynthetic=${p.corpusRowsByOrigin.teacherSynthetic}`,
    `  training dispatches :: recent=${d.recent} withProtocolPractice=${d.withPractice} latestAt=${d.latestAt ?? 'none'} latestWithPractice=${yes(d.latestWithPractice)}${d.latestPracticeTaskIds.length ? ` latestTasks=${d.latestPracticeTaskIds.join(',')}` : ''}`,
    `  training runs       :: recent=${r.recent} latestStage=${r.latestStage ?? 'none'} latestAt=${r.latestAt ?? 'none'} byStage=${kv(r.byStage)}${r.latestFailureReason ? ` latestFailure=${r.latestFailureAt ?? 'n/a'} ${r.latestFailureReason}` : ''}`,
    `  trained artifacts   :: recent=${a.recent} trainedWithProtocolPractice=${a.trainedWithPractice} latestAt=${a.latestAt ?? 'none'} latestStatus=${a.latestStatus ?? 'none'} latestWithPractice=${yes(a.latestWithPractice)} byStatus=${kv(a.byStatus)}`,
    `  residency           :: awaitingAdmission=${s.awaitingAdmission} (withPractice=${s.awaitingAdmissionWithPractice}) activeResidents=${s.activeResidents} latestCaseStartedAt=${s.latestCaseStartedAt ?? 'none'} latestCaseCompletedAt=${s.latestCaseCompletedAt ?? 'none'} latestCaseStatus=${s.latestCaseStatus ?? 'none'} recentCases=${s.recentCases} recentFailed=${s.recentFailedCases} recentFailedWithLoopStop=${s.recentFailedCasesWithLoopStop} failedByCase=${kv(s.recentFailedByCaseFamily)}`,
  ].join('\n')
}
// end of saas/lib/ai/cos/cosUniversityComputerSciencePath.ts (if this line is missing, the paste was cut short)
