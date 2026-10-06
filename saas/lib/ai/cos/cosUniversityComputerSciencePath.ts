// saas/lib/ai/cos/cosUniversityComputerSciencePath.ts
//
// The Computer Science path, as it stands right now (owner go 2026-10-06). Builder Residency is the only Step 1 blocker,
// and a change to Computer Science training shows up in Residency only after a newly trained artifact is dispatched,
// trained, admitted and given cases. The cohort report cannot show where that artifact is, so this snapshot reads the
// path end to end from durable tables:
//
//   training dispatches   latest Computer Science training dispatches and whether each carried Builder protocol practice
//                         (pre-dispatch assurance evidence, cos_university_learning_assurance_events)
//   training runs         latest Computer Science mass-distillation runs by stage (cos_university_mass_distillation_batch_runs)
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
  trainingRuns: Readonly<{ recent: number; byStage: Readonly<Record<string, number>>; latestStage: string | null; latestAt: string | null }>
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
  }>
}>

/** Read the Computer Science path as it stands now. Window-independent: it describes the present, not a cohort. */
export async function readComputerSciencePath(input: { db: Db; now?: Date }): Promise<ComputerSciencePath> {
  const db = input.db
  const now = input.now ?? new Date()

  const [dispatchRows, runRows, artifactRows, activeRows, caseRows] = await Promise.all([
    rows(db.from('cos_university_learning_assurance_events')
      .select('candidate_id,observed_at,evidence')
      .eq('subject_id', SUBJECT)
      .eq('evidence->>claim', PRE_DISPATCH_CLAIM)
      .eq('evidence->>stage', TRAINING_STAGE)
      .order('observed_at', { ascending: false })
      .limit(RECENT)),
    rows(db.from('cos_university_mass_distillation_batch_runs')
      .select('stage,created_at,updated_at')
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
      .select('status,started_at,completed_at,metadata')
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
    trainingRuns: Object.freeze({
      recent: runRows.length,
      byStage: tally(runRows.map(row => text(row.stage, 60) || 'unrecorded')),
      latestStage: runRows[0] ? text(runRows[0].stage, 60) || null : null,
      latestAt: iso(runRows[0]?.updated_at ?? runRows[0]?.created_at),
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
      recentFailedCasesWithLoopStop: withLoopStop.length,
    }),
  })
}

/** One plain block for the Step 1 report log. */
export function describeComputerSciencePath(path: ComputerSciencePath): string {
  const kv = (map: Readonly<Record<string, number>>) => Object.entries(map).map(([key, value]) => `${key}=${value}`).join(',') || 'none'
  const yes = (value: boolean | null) => value === null ? 'n/a' : value ? 'yes' : 'no'
  const d = path.trainingDispatches, r = path.trainingRuns, a = path.trainedArtifacts, s = path.residency
  return [
    `COMPUTER SCIENCE PATH (now ${path.observedAt}; latest ${RECENT} of each)`,
    `  training dispatches :: recent=${d.recent} withProtocolPractice=${d.withPractice} latestAt=${d.latestAt ?? 'none'} latestWithPractice=${yes(d.latestWithPractice)}${d.latestPracticeTaskIds.length ? ` latestTasks=${d.latestPracticeTaskIds.join(',')}` : ''}`,
    `  training runs       :: recent=${r.recent} latestStage=${r.latestStage ?? 'none'} latestAt=${r.latestAt ?? 'none'} byStage=${kv(r.byStage)}`,
    `  trained artifacts   :: recent=${a.recent} trainedWithProtocolPractice=${a.trainedWithPractice} latestAt=${a.latestAt ?? 'none'} latestStatus=${a.latestStatus ?? 'none'} latestWithPractice=${yes(a.latestWithPractice)} byStatus=${kv(a.byStatus)}`,
    `  residency           :: awaitingAdmission=${s.awaitingAdmission} (withPractice=${s.awaitingAdmissionWithPractice}) activeResidents=${s.activeResidents} latestCaseStartedAt=${s.latestCaseStartedAt ?? 'none'} latestCaseCompletedAt=${s.latestCaseCompletedAt ?? 'none'} latestCaseStatus=${s.latestCaseStatus ?? 'none'} recentCases=${s.recentCases} recentFailed=${s.recentFailedCases} recentFailedWithLoopStop=${s.recentFailedCasesWithLoopStop}`,
  ].join('\n')
}
// end of saas/lib/ai/cos/cosUniversityComputerSciencePath.ts (if this line is missing, the paste was cut short)
