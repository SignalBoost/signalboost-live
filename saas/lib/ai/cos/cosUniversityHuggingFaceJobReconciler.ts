import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  HUGGING_FACE_JOBS_API,
  huggingFaceJobsConfigFromEnv,
  resolveHuggingFaceNamespace,
} from './cosUniversityHuggingFaceJobs.ts'

const TERMINAL_STAGES = new Set(['COMPLETED', 'CANCELED', 'ERROR', 'DELETED'])
const NONTERMINAL_STAGES = new Set(['SCHEDULING', 'RUNNING'])
const RECONCILE_PROFILE = 'cos-university-mass-distillation-hf-reconcile-v1' as const
const TERMINAL_GRACE_SECONDS = 120

type FetchPort = (url: string, init?: RequestInit) => Promise<Response>
type JobStage = 'COMPLETED' | 'CANCELED' | 'ERROR' | 'DELETED' | 'SCHEDULING' | 'RUNNING'
type DispatchedStage = 'teacher_dispatched' | 'preparation_dispatched' | 'training_dispatched'

type JobInspection = Readonly<{
  jobId: string
  stage: JobStage
  message: string | null
  createdAt: string | null
  startedAt: string | null
  finishedAt: string | null
  schedulingSeconds: number | null
  runningSeconds: number | null
  totalSeconds: number | null
}>

function clean(value: unknown, limit = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function finiteNonnegative(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function jobIdForRun(run: any): string {
  if (run.stage === 'teacher_dispatched') return clean(run.teacher_job_id, 240)
  if (run.stage === 'preparation_dispatched') return clean(run.preparation_job_id, 240)
  if (run.stage === 'training_dispatched') return clean(run.training_job_id, 240)
  return ''
}

function safeIso(value: unknown): string | null {
  const text = clean(value, 80)
  return text && Number.isFinite(Date.parse(text)) ? text : null
}

export async function inspectHuggingFaceJob(input: {
  namespace: string
  jobId: string
  token: string
  fetchImpl?: FetchPort
}): Promise<JobInspection> {
  const namespace = clean(input.namespace, 200)
  const jobId = clean(input.jobId, 240)
  if (!namespace || !/^[A-Za-z0-9_.-]+$/.test(namespace)) throw new Error('huggingface_job_namespace_invalid')
  if (!jobId || !/^[A-Za-z0-9_-]+$/.test(jobId)) throw new Error('huggingface_job_id_invalid')
  const response = await (input.fetchImpl || fetch)(
    `${HUGGING_FACE_JOBS_API}/api/jobs/${encodeURIComponent(namespace)}/${encodeURIComponent(jobId)}`,
    { headers: { authorization: `Bearer ${input.token}` }, redirect: 'error' },
  )
  if (!response.ok) throw new Error(`huggingface_job_inspection_rejected:${response.status}`)
  const payload = await response.json() as any
  const resolvedId = clean(payload?.id, 240)
  const stage = clean(payload?.status?.stage, 40).toUpperCase()
  if (resolvedId !== jobId || (!TERMINAL_STAGES.has(stage) && !NONTERMINAL_STAGES.has(stage))) {
    throw new Error('huggingface_job_inspection_invalid')
  }
  return Object.freeze({
    jobId,
    stage: stage as JobStage,
    message: clean(payload?.status?.message, 300) || null,
    createdAt: safeIso(payload?.created_at ?? payload?.createdAt),
    startedAt: safeIso(payload?.started_at ?? payload?.startedAt),
    finishedAt: safeIso(payload?.finished_at ?? payload?.finishedAt),
    schedulingSeconds: finiteNonnegative(payload?.durations?.scheduling_secs ?? payload?.durations?.schedulingSecs),
    runningSeconds: finiteNonnegative(payload?.durations?.running_secs ?? payload?.durations?.runningSecs),
    totalSeconds: finiteNonnegative(payload?.durations?.total_secs ?? payload?.durations?.totalSecs),
  })
}

export function conservativeObservedHuggingFaceCostUsd(input: {
  job: JobInspection
  hourlyCostUsd: number | null
  reservedCostUsd: number
}): number {
  const reserved = Number(input.reservedCostUsd)
  if (!Number.isFinite(reserved) || reserved < 0) throw new Error('huggingface_reconcile_reserved_cost_invalid')
  const hourly = Number(input.hourlyCostUsd)
  const seconds = input.job.totalSeconds ?? input.job.runningSeconds
  if (!Number.isFinite(hourly) || hourly <= 0 || seconds === null || !Number.isFinite(seconds)) return reserved
  const billedMinutes = Math.max(0, Math.ceil(seconds / 60))
  const estimate = billedMinutes * hourly / 60
  return Number(Math.min(reserved, Math.max(0, estimate)).toFixed(6))
}

async function dispatchEvidence(candidateId: string, jobId: string) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_learning_assurance_events')
    .select('evidence,observed_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .eq('verifier', 'host_controller')
    .order('observed_at', { ascending: false })
    .limit(20)
  if (result.error) throw result.error
  return (result.data || []).find((row: any) => row?.evidence?.claim === 'mass_distillation_job_dispatched'
    && String(row?.evidence?.jobId || '') === jobId)?.evidence || null
}

async function recordObservation(input: {
  candidateId: string
  subjectId: string
  claim: string
  evidence: Record<string, unknown>
}) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const evidence = {
    profile: RECONCILE_PROFILE,
    claim: input.claim,
    candidateId: input.candidateId,
    ...input.evidence,
    authorityExpanded: false,
  }
  const evidenceHash = hash(evidence)
  const eventKey = hash([RECONCILE_PROFILE, input.claim, input.candidateId, evidenceHash])
  const inserted = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: eventKey,
    event_type: 'fine_tune',
    subject_id: input.subjectId,
    candidate_id: input.candidateId,
    evidence_hash: evidenceHash,
    evidence,
    verifier: 'host_controller',
    observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (inserted.error) throw inserted.error
}

function providerFailureReason(job: JobInspection): string {
  const message = job.message ? `:${clean(job.message, 180)}` : ''
  if (job.stage === 'COMPLETED') return `huggingface_completed_without_callback${message}`
  return `huggingface_provider_${job.stage.toLowerCase()}${message}`
}

export async function reconcileMassDistillationHuggingFaceJobs(input: {
  now?: Date
  maxJobs?: number
  fetchImpl?: FetchPort
} = {}) {
  const hf = huggingFaceJobsConfigFromEnv()
  if (!hf) return { ok: false as const, skipped: true as const, reason: 'huggingface_not_configured' as const }
  const db = cosServiceDb()
  if (!db) return { ok: false as const, skipped: true as const, reason: 'service_database_unavailable' as const }
  const namespace = await resolveHuggingFaceNamespace({ token: hf.token, fetchImpl: input.fetchImpl })
  const now = input.now || new Date()
  const maxJobs = Math.max(1, Math.min(20, Math.floor(input.maxJobs ?? 10)))
  const rows = await db.from('cos_university_mass_distillation_batch_runs')
    .select('id,campaign_id,batch_key,candidate_id,subject_id,stage,stage_reserved_cost_usd,claimed_at,teacher_job_id,preparation_job_id,training_job_id')
    .in('stage', ['teacher_dispatched', 'preparation_dispatched', 'training_dispatched'])
    .order('updated_at', { ascending: true })
    .limit(maxJobs)
  if (rows.error) throw rows.error

  const observations: Array<Record<string, unknown>> = []
  for (const run of rows.data || []) {
    const stage = String((run as any).stage) as DispatchedStage
    const jobId = jobIdForRun(run)
    if (!jobId) {
      observations.push({ runId: (run as any).id, stage, status: 'missing_job_id' })
      continue
    }
    const job = await inspectHuggingFaceJob({ namespace, jobId, token: hf.token, fetchImpl: input.fetchImpl })
    const dispatch = await dispatchEvidence(String((run as any).candidate_id), jobId)
    const timeoutSeconds = finiteNonnegative(dispatch?.timeoutSeconds)
    const hourlyCostUsd = finiteNonnegative(dispatch?.hourlyCostUsd)
    const claimedAtMs = Date.parse(String((run as any).claimed_at || ''))
    const deadlineMs = Number.isFinite(claimedAtMs) && timeoutSeconds !== null
      ? claimedAtMs + (timeoutSeconds + TERMINAL_GRACE_SECONDS) * 1000
      : null

    if (NONTERMINAL_STAGES.has(job.stage)) {
      const overdue = deadlineMs !== null && now.getTime() > deadlineMs
      if (overdue) {
        await recordObservation({
          candidateId: String((run as any).candidate_id),
          subjectId: String((run as any).subject_id),
          claim: 'mass_distillation_provider_timeout_overdue',
          evidence: { campaignId: (run as any).campaign_id, batchKey: (run as any).batch_key, runId: (run as any).id, jobId, providerStage: job.stage, timeoutSeconds },
        })
      }
      observations.push({ runId: (run as any).id, jobId, providerStage: job.stage, overdue })
      continue
    }

    const reservedCostUsd = Number((run as any).stage_reserved_cost_usd || 0)
    const observedCostUsd = conservativeObservedHuggingFaceCostUsd({ job, hourlyCostUsd, reservedCostUsd })
    const reason = providerFailureReason(job)
    const settled = await db.rpc('settle_cos_university_mass_distillation_provider_terminal', {
      p_run_id: (run as any).id,
      p_job_id: jobId,
      p_failure_reason: reason,
      p_observed_cost_usd: observedCostUsd,
    })
    if (settled.error) throw settled.error
    await recordObservation({
      candidateId: String((run as any).candidate_id),
      subjectId: String((run as any).subject_id),
      claim: 'mass_distillation_provider_terminal_reconciled',
      evidence: {
        campaignId: (run as any).campaign_id,
        batchKey: (run as any).batch_key,
        runId: (run as any).id,
        jobId,
        providerStage: job.stage,
        providerMessage: job.message,
        observedCostUsd,
        reservedCostUsd,
        settlement: settled.data,
      },
    })
    observations.push({ runId: (run as any).id, jobId, providerStage: job.stage, settled: true, observedCostUsd })
  }

  return {
    ok: true as const,
    inspected: (rows.data || []).length,
    observations,
    semantics: 'provider_status_is_read_only_terminal_jobs_settle_fail_closed_no_automatic_retry' as const,
  }
}
