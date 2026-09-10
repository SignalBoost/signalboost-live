import { randomUUID } from 'node:crypto'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import {
  beginEvidenceSourceUseTurn,
  peekEvidenceSourceUseTurnId,
} from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { flushCapturedEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'
import { attachTurnOutcome } from '@/lib/ai/cos/turnExperienceStore'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  COS_UNIVERSITY_PHD_PROGRAMS,
  cosUniversityPhdDistinctPassesAfterLatestFailure,
  type CosUniversityPhdProgramId,
  type CosUniversityPhdResearchLineage,
} from './cosUniversityPhd.ts'
import {
  cosUniversityPhdActorIdentityEligible,
  readCosUniversityPhdEvidence,
  readCosUniversityPhdRuntimeStatus,
  recordHostCosUniversityPhdActorIdentity,
  recordHostCosUniversityPhdEvidence,
  type CosUniversityPhdActorIdentity,
} from './cosUniversityPhdRuntime.ts'
import {
  COS_UNIVERSITY_PHD_METHODOLOGY_EXAM_PROFILE,
  COS_UNIVERSITY_PHD_METHODOLOGY_EXAMINER_ACTOR_ID,
  COS_UNIVERSITY_PHD_METHODOLOGY_SCORER,
  buildCosUniversityPhdMethodologyExam,
  scoreCosUniversityPhdMethodologyExam,
} from './cosUniversityPhdMethodologyExam.ts'

const AGENT_ID = 'cos'
const EVIDENCE_VALIDITY_DAYS = 365

type ExamRunRow = {
  id: string
  run_key: string
  program_id: CosUniversityPhdProgramId
  research_project_id: string
  protocol_id: string
  candidate_actor_id: string
  evaluator_actor_id: string
  profile: string
  scorer_version: string
  seed: string
  manifest_hash: string
  variant_hash: string
  status: 'created' | 'running' | 'passed' | 'failed' | 'error'
  passed: boolean | null
  reasons: string[] | null
  latency_ms: number | null
  evidence_recorded: boolean
}

type CandidateIdentityRow = {
  actor_id: string
  actor_role: CosUniversityPhdActorIdentity['actorRole']
  principal_type: CosUniversityPhdActorIdentity['principalType']
  principal_fingerprint: string
  source_ref: string
  valid_from: string
  valid_until: string
}

export type CosUniversityPhdMethodologyExamRunSummary = Readonly<{
  enabled: boolean
  programId: CosUniversityPhdProgramId | null
  runId: string | null
  status:
    | 'disabled'
    | 'not_enrolled'
    | 'program_inactive'
    | 'research_project_required'
    | 'ambiguous_research_lineage'
    | 'complete'
    | 'passed'
    | 'failed'
    | 'error'
    | 'already_complete'
    | 'not_claimed'
  passed: boolean | null
  evidenceRecorded: boolean
  turnId: string | null
  reasons: string[]
  latencyMs: number | null
  semantics: 'host_seeded_phd_methodology_exam_independent_from_candidate_research'
}>

function summary(args: Partial<CosUniversityPhdMethodologyExamRunSummary> = {}): CosUniversityPhdMethodologyExamRunSummary {
  return {
    enabled: process.env.COS_UNIVERSITY_PHD_METHODOLOGY_EXAMS_ENABLED === 'true',
    programId: null,
    runId: null,
    status: 'error',
    passed: null,
    evidenceRecorded: false,
    turnId: null,
    reasons: [],
    latencyMs: null,
    semantics: 'host_seeded_phd_methodology_exam_independent_from_candidate_research',
    ...args,
  }
}

function dbOrThrow() {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  return db
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  try { return JSON.stringify(error).slice(0, 1600) } catch { return String(error) }
}

function hourKey(now: Date): string {
  return now.toISOString().slice(0, 13)
}

function lineage(candidateActorId: string, researchProjectId: string, protocolId: string): CosUniversityPhdResearchLineage {
  return { candidateActorId, researchProjectId, protocolId }
}

async function activeProgram(now: Date): Promise<{
  programId: CosUniversityPhdProgramId
  candidateActorId: string
  researchProjectId: string
  protocolId: string
} | null | 'project_required' | 'ambiguous_lineage'> {
  const ids = Object.keys(COS_UNIVERSITY_PHD_PROGRAMS) as CosUniversityPhdProgramId[]
  for (const programId of ids) {
    const status = await readCosUniversityPhdRuntimeStatus(programId, now)
    if (!status.enrollment && !status.credential) continue
    if (status.credential || status.timingStatus === 'deadline_expired' || status.timingStatus === 'not_enrolled') return null
    if (!status.projects.length) return 'project_required'
    if (status.projects.length !== 1) return 'ambiguous_lineage'
    const project = status.projects[0]
    return {
      programId,
      candidateActorId: project.candidateActorId,
      researchProjectId: project.researchProjectId,
      protocolId: project.protocolId,
    }
  }
  return null
}

async function candidateIdentity(actorId: string): Promise<CosUniversityPhdActorIdentity | null> {
  const result = await dbOrThrow().from('cos_university_phd_actor_identities')
    .select('actor_id,actor_role,principal_type,principal_fingerprint,source_ref,valid_from,valid_until')
    .eq('actor_id', actorId)
    .maybeSingle()
  if (result.error) throw result.error
  const row = (result.data || null) as CandidateIdentityRow | null
  if (!row) return null
  return {
    actorId: row.actor_id,
    actorRole: row.actor_role,
    principalType: row.principal_type,
    principalFingerprint: row.principal_fingerprint,
    sourceRef: row.source_ref,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
  }
}

async function findRun(runKey: string): Promise<ExamRunRow | null> {
  const result = await dbOrThrow().from('cos_university_phd_methodology_exam_runs')
    .select('id,run_key,program_id,research_project_id,protocol_id,candidate_actor_id,evaluator_actor_id,profile,scorer_version,seed,manifest_hash,variant_hash,status,passed,reasons,latency_ms,evidence_recorded')
    .eq('run_key', runKey)
    .maybeSingle()
  if (result.error) throw result.error
  return (result.data || null) as ExamRunRow | null
}

async function createOrFindRun(input: {
  programId: CosUniversityPhdProgramId
  candidateActorId: string
  researchProjectId: string
  protocolId: string
  now: Date
}): Promise<ExamRunRow | null> {
  const runKey = `${COS_UNIVERSITY_PHD_METHODOLOGY_EXAM_PROFILE}:${hourKey(input.now)}:${input.programId}:${input.researchProjectId}:${input.protocolId}`
  const existing = await findRun(runKey)
  if (existing) return existing
  const seed = randomUUID()
  const exam = buildCosUniversityPhdMethodologyExam(seed, input.programId)
  const insert = await dbOrThrow().from('cos_university_phd_methodology_exam_runs').insert({
    run_key: runKey,
    agent_id: AGENT_ID,
    program_key: `specialist_phd_${input.programId}_v1`,
    program_id: input.programId,
    research_project_id: input.researchProjectId,
    protocol_id: input.protocolId,
    candidate_actor_id: input.candidateActorId,
    evaluator_actor_id: COS_UNIVERSITY_PHD_METHODOLOGY_EXAMINER_ACTOR_ID,
    profile: exam.profile,
    scorer_version: exam.scorerVersion,
    seed,
    manifest_hash: exam.manifestHash,
    variant_hash: exam.manifestHash,
    status: 'created',
    observed_at: input.now.toISOString(),
    updated_at: input.now.toISOString(),
  }).select('id,run_key,program_id,research_project_id,protocol_id,candidate_actor_id,evaluator_actor_id,profile,scorer_version,seed,manifest_hash,variant_hash,status,passed,reasons,latency_ms,evidence_recorded').maybeSingle()
  if (!insert.error && insert.data) return insert.data as ExamRunRow
  if (insert.error && String((insert.error as { code?: string }).code || '') !== '23505') throw insert.error
  return findRun(runKey)
}

async function claimRun(row: ExamRunRow, now: Date): Promise<boolean> {
  if (row.status !== 'created') return false
  const result = await dbOrThrow().from('cos_university_phd_methodology_exam_runs').update({
    status: 'running',
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq('id', row.id).eq('status', 'created').select('id').maybeSingle()
  if (result.error) throw result.error
  return Boolean(result.data?.id)
}

async function finishRun(input: {
  row: ExamRunRow
  status: 'passed' | 'failed' | 'error'
  passed: boolean | null
  evidenceRecorded: boolean
  turnId: string | null
  responseSource: string | null
  localModelInvoked: boolean | null
  externalAiInvoked: boolean | null
  freshExecution: boolean
  reasons: string[]
  latencyMs: number
  completedAt: Date
}): Promise<void> {
  const result = await dbOrThrow().from('cos_university_phd_methodology_exam_runs').update({
    status: input.status,
    passed: input.passed,
    evidence_recorded: input.evidenceRecorded,
    turn_id: input.turnId,
    response_source: input.responseSource,
    local_model_invoked: input.localModelInvoked,
    external_ai_invoked: input.externalAiInvoked,
    fresh_execution: input.freshExecution,
    reasons: input.reasons,
    latency_ms: input.latencyMs,
    completed_at: input.completedAt.toISOString(),
    updated_at: input.completedAt.toISOString(),
  }).eq('id', input.row.id).eq('status', 'running')
  if (result.error) throw result.error
}

async function executeRun(row: ExamRunRow, now: Date): Promise<CosUniversityPhdMethodologyExamRunSummary> {
  if (!(await claimRun(row, now))) {
    return summary({ programId: row.program_id, runId: row.id, status: 'not_claimed', reasons: ['methodology_exam_claim_not_acquired'] })
  }

  const exam = buildCosUniversityPhdMethodologyExam(row.seed, row.program_id)
  if (exam.manifestHash !== row.manifest_hash
    || row.profile !== exam.profile
    || row.scorer_version !== exam.scorerVersion
    || row.evaluator_actor_id !== COS_UNIVERSITY_PHD_METHODOLOGY_EXAMINER_ACTOR_ID) {
    const reasons = ['exam_manifest_drift']
    await finishRun({
      row, status: 'error', passed: null, evidenceRecorded: false, turnId: null,
      responseSource: null, localModelInvoked: null, externalAiInvoked: null,
      freshExecution: false, reasons, latencyMs: 0, completedAt: now,
    })
    return summary({ programId: row.program_id, runId: row.id, status: 'error', reasons })
  }

  const examinerReady = await recordHostCosUniversityPhdActorIdentity({
    actorId: COS_UNIVERSITY_PHD_METHODOLOGY_EXAMINER_ACTOR_ID,
    actorRole: 'methodology_examiner',
    principalType: 'system',
    principalFingerprint: COS_UNIVERSITY_PHD_METHODOLOGY_SCORER,
    sourceRef: `cos_university_phd_methodology_exam:${COS_UNIVERSITY_PHD_METHODOLOGY_EXAM_PROFILE}`,
    validFrom: now,
    validityDays: 3650,
  })
  if (!examinerReady) {
    const reasons = ['methodology_examiner_identity_unavailable']
    await finishRun({
      row, status: 'error', passed: null, evidenceRecorded: false, turnId: null,
      responseSource: null, localModelInvoked: null, externalAiInvoked: null,
      freshExecution: false, reasons, latencyMs: 0, completedAt: now,
    })
    return summary({ programId: row.program_id, runId: row.id, status: 'error', reasons })
  }

  const started = Date.now()
  beginEvidenceSourceUseTurn()
  let result: Awaited<ReturnType<typeof tryCOSFirstAnswer>>
  try {
    if (process.env.COS_LOCAL_FIRST_ENABLED !== 'false') {
      await ensureLocalInferenceRuntimeReady()
      await generateLocalEmbedding(exam.prompt)
    }
    result = await tryCOSFirstAnswer({
      prompt: exam.prompt,
      language: 'en',
      privileged: true,
      disableCache: true,
    })
  } catch (error) {
    flushCapturedEvidenceSourceUse()
    const completedAt = new Date()
    const reasons = [`execution_error:${describeError(error)}`]
    await finishRun({
      row, status: 'error', passed: null, evidenceRecorded: false, turnId: null,
      responseSource: null, localModelInvoked: null, externalAiInvoked: null,
      freshExecution: false, reasons, latencyMs: Date.now() - started, completedAt,
    })
    return summary({ programId: row.program_id, runId: row.id, status: 'error', reasons, latencyMs: Date.now() - started })
  }

  const completedAt = new Date()
  const turnId = peekEvidenceSourceUseTurnId()
  const reply = result.handled ? result.reply : ('bestEffortReply' in result ? result.bestEffortReply ?? '' : '')
  const semanticCache = result.provenance.responseSource === 'semantic_cache'
    || result.provenance.responseSource === 'semantic_similarity'
  const score = scoreCosUniversityPhdMethodologyExam(exam, reply, {
    localReasoning: result.provenance.localModelInvoked,
    externalAi: result.provenance.externalAiInvoked,
    semanticCache,
    handled: result.handled,
    turnId,
  })
  const candidate = await candidateIdentity(row.candidate_actor_id)
  const reasonerFingerprint = String(result.provenance.reasonerLabel || '').trim()
  const candidateMatchesReasoner = Boolean(
    candidate
    && candidate.actorRole === 'candidate'
    && candidate.principalType === 'ai_model'
    && cosUniversityPhdActorIdentityEligible(candidate, completedAt)
    && candidate.principalFingerprint === reasonerFingerprint,
  )
  const freshExecution = Boolean(
    result.handled
    && result.provenance.localModelInvoked
    && !result.provenance.externalAiInvoked
    && !semanticCache
    && turnId
    && candidateMatchesReasoner,
  )
  const reasons = [
    ...score.reasons,
    ...(!candidateMatchesReasoner ? ['candidate_reasoner_principal_mismatch'] : []),
    ...(!freshExecution ? ['fresh_candidate_execution_required'] : []),
  ]
  flushCapturedEvidenceSourceUse()

  let evidenceRecorded = false
  let evidenceError: string | null = null
  if (freshExecution) {
    const validUntil = new Date(completedAt.getTime() + EVIDENCE_VALIDITY_DAYS * 86_400_000)
    try {
      evidenceRecorded = await recordHostCosUniversityPhdEvidence({
        evidenceKey: `phd-methodology-exam:${row.id}`,
        evidence: {
          evidenceId: `phd-methodology-exam:${row.id}`,
          programId: row.program_id,
          stage: 'research_methodology_exam',
          researchProjectId: row.research_project_id,
          protocolId: row.protocol_id,
          candidateActorId: row.candidate_actor_id,
          performerActorIds: [row.candidate_actor_id],
          evaluatorActorIds: [row.evaluator_actor_id],
          identityProvenance: 'host_identity_ledger',
          parentEvidenceIds: [],
          passed: score.passed,
          variantHash: row.variant_hash,
          observedAt: completedAt.toISOString(),
          validUntil: validUntil.toISOString(),
          independent: true,
          authority: 'host_private_exam',
        },
        sourceRef: `cos_university_phd_methodology_exam:${row.id}`,
        scorerVersion: COS_UNIVERSITY_PHD_METHODOLOGY_SCORER,
        evidenceSnapshot: {
          profile: COS_UNIVERSITY_PHD_METHODOLOGY_EXAM_PROFILE,
          manifestHash: row.manifest_hash,
          turnId,
          responseSource: result.provenance.responseSource,
          localModelInvoked: result.provenance.localModelInvoked,
          externalAiInvoked: result.provenance.externalAiInvoked,
          candidateReasonerMatched: candidateMatchesReasoner,
          reasons: score.reasons,
        },
      })
    } catch (error) {
      evidenceError = `evidence_record_error:${describeError(error)}`
    }
  }

  const finalReasons = [
    ...reasons,
    ...(!evidenceRecorded && freshExecution ? [evidenceError || 'phd_methodology_evidence_not_recorded'] : []),
  ]
  const terminalStatus: 'passed' | 'failed' | 'error' = !freshExecution || !evidenceRecorded
    ? 'error'
    : score.passed ? 'passed' : 'failed'
  const passed = terminalStatus === 'error' ? null : score.passed
  const latencyMs = Date.now() - started
  await finishRun({
    row,
    status: terminalStatus,
    passed,
    evidenceRecorded,
    turnId: turnId || null,
    responseSource: result.provenance.responseSource,
    localModelInvoked: Boolean(result.provenance.localModelInvoked),
    externalAiInvoked: Boolean(result.provenance.externalAiInvoked),
    freshExecution,
    reasons: finalReasons,
    latencyMs,
    completedAt,
  })

  if (turnId) {
    await attachTurnOutcome(turnId, {
      verifiedSuccess: Boolean(score.passed && evidenceRecorded && freshExecution),
      repairNeeded: !score.passed || !evidenceRecorded || !freshExecution,
      escalated: !result.handled,
      source: `cos_university_phd_methodology_exam:${row.id}`,
    })
  }

  return summary({
    programId: row.program_id,
    runId: row.id,
    status: terminalStatus,
    passed,
    evidenceRecorded,
    turnId: turnId || null,
    reasons: finalReasons,
    latencyMs,
  })
}

export async function runCosUniversityPhdMethodologyExam(options: { now?: Date } = {}): Promise<CosUniversityPhdMethodologyExamRunSummary> {
  const now = options.now instanceof Date ? options.now : new Date()
  if (process.env.COS_UNIVERSITY_PHD_METHODOLOGY_EXAMS_ENABLED !== 'true') return summary({ enabled: false, status: 'disabled' })

  try {
    const active = await activeProgram(now)
    if (active === 'project_required') return summary({ status: 'research_project_required' })
    if (active === 'ambiguous_lineage') return summary({ status: 'ambiguous_research_lineage' })
    if (!active) {
      const anyEnrollment = await Promise.all((Object.keys(COS_UNIVERSITY_PHD_PROGRAMS) as CosUniversityPhdProgramId[])
        .map(programId => readCosUniversityPhdRuntimeStatus(programId, now)))
      return summary({ status: anyEnrollment.some(item => item.enrollment || item.credential) ? 'program_inactive' : 'not_enrolled' })
    }

    const evidence = await readCosUniversityPhdEvidence(active.programId)
    const program = COS_UNIVERSITY_PHD_PROGRAMS[active.programId]
    const passCount = cosUniversityPhdDistinctPassesAfterLatestFailure(
      evidence,
      active.programId,
      'research_methodology_exam',
      lineage(active.candidateActorId, active.researchProjectId, active.protocolId),
      now,
    )
    if (passCount >= program.aPlusDistinctPasses.research_methodology_exam) {
      return summary({ programId: active.programId, status: 'complete' })
    }

    const row = await createOrFindRun({ ...active, now })
    if (!row) return summary({ programId: active.programId, status: 'error', reasons: ['methodology_exam_run_not_created'] })
    if (row.status === 'passed' || row.status === 'failed' || row.status === 'error') {
      return summary({
        programId: row.program_id,
        runId: row.id,
        status: 'already_complete',
        passed: row.passed,
        evidenceRecorded: row.evidence_recorded,
        reasons: row.reasons || [],
        latencyMs: row.latency_ms,
      })
    }
    if (row.status !== 'created') return summary({ programId: row.program_id, runId: row.id, status: 'not_claimed', reasons: ['methodology_exam_run_active'] })
    return executeRun(row, now)
  } catch (error) {
    return summary({ status: 'error', reasons: [describeError(error)] })
  }
}
