import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  HUGGING_FACE_JOBS_API,
  huggingFaceJobsConfigFromEnv,
  resolveHuggingFaceNamespace,
} from './cosUniversityHuggingFaceJobs.ts'

const PROFILE = 'cos-university-mass-distillation-hf-diagnostics-v1' as const
const CLAIM = 'mass_distillation_provider_log_tail' as const
const JOB_ID = /^[A-Za-z0-9_-]{3,240}$/
type FetchPort = (url: string, init?: RequestInit) => Promise<Response>

function clean(value: unknown, limit = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function safeLogLine(value: unknown): string {
  return clean(value, 700)
    .replace(/\b(Bearer|token|secret|api[_-]?key|HF_TOKEN)\b\s*[:=]?\s*[^,;\s]+/gi, '$1=[redacted]')
    .replace(/hf_[A-Za-z0-9_-]{10,}/g, 'hf_[redacted]')
}

export function parseHuggingFaceJobLogSse(raw: string, limit = 40): string[] {
  const lines: string[] = []
  for (const sourceLine of String(raw || '').split(/\r?\n/)) {
    if (!sourceLine.startsWith('data:')) continue
    const payload = sourceLine.slice('data:'.length).trim()
    if (!payload) continue
    let value: unknown = payload
    try {
      const parsed = JSON.parse(payload)
      value = typeof parsed === 'string' ? parsed : parsed?.data ?? parsed?.message ?? ''
    } catch {
      // Some historical Jobs endpoints emitted a plain string in data: rather than JSON.
    }
    const safe = safeLogLine(value)
    if (safe) lines.push(safe)
  }
  return lines.slice(-Math.max(1, Math.min(100, Math.floor(limit))))
}

export async function fetchHuggingFaceJobLogTail(input: {
  namespace: string
  jobId: string
  token: string
  limit?: number
  fetchImpl?: FetchPort
}): Promise<string[]> {
  const namespace = clean(input.namespace, 200)
  const jobId = clean(input.jobId, 240)
  if (!namespace || !/^[A-Za-z0-9_.-]+$/.test(namespace)) throw new Error('huggingface_job_log_namespace_invalid')
  if (!JOB_ID.test(jobId)) throw new Error('huggingface_job_log_id_invalid')
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 40)))
  const response = await (input.fetchImpl || fetch)(
    `${HUGGING_FACE_JOBS_API}/api/jobs/${encodeURIComponent(namespace)}/${encodeURIComponent(jobId)}/logs?tail=${limit}`,
    {
      headers: { authorization: `Bearer ${input.token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!response.ok) throw new Error(`huggingface_job_logs_rejected:${response.status}`)
  return parseHuggingFaceJobLogSse(await response.text(), limit)
}

async function alreadyRecorded(candidateId: string, jobId: string): Promise<boolean> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_learning_assurance_events')
    .select('evidence')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .eq('verifier', 'host_controller')
    .order('observed_at', { ascending: false })
    .limit(30)
  if (result.error) throw result.error
  return (result.data || []).some((row: any) => row?.evidence?.profile === PROFILE
    && row?.evidence?.claim === CLAIM
    && String(row?.evidence?.jobId || '') === jobId)
}

async function record(input: {
  candidateId: string
  subjectId: string
  campaignId: string
  batchKey: string
  runId: string
  jobId: string
  logTail: readonly string[]
}) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const evidence = {
    profile: PROFILE,
    claim: CLAIM,
    candidateId: input.candidateId,
    campaignId: input.campaignId,
    batchKey: input.batchKey,
    runId: input.runId,
    jobId: input.jobId,
    logTail: [...input.logTail],
    logLineCount: input.logTail.length,
    readOnlyProviderInspection: true,
    automaticRetryAuthorized: false,
    authorityExpanded: false,
  }
  const evidenceHash = hash(evidence)
  const inserted = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: hash([PROFILE, CLAIM, input.candidateId, input.jobId, evidenceHash]),
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

/** Read-only diagnostics for terminal provider jobs already settled by the reconciler. */
export async function diagnoseFailedMassDistillationHuggingFaceJobs(input: {
  maxJobs?: number
  fetchImpl?: FetchPort
} = {}) {
  const hf = huggingFaceJobsConfigFromEnv()
  if (!hf) return { ok: false as const, skipped: true as const, reason: 'huggingface_not_configured' as const }
  const db = cosServiceDb()
  if (!db) return { ok: false as const, skipped: true as const, reason: 'service_database_unavailable' as const }
  const namespace = await resolveHuggingFaceNamespace({ token: hf.token, fetchImpl: input.fetchImpl })
  const maxJobs = Math.max(1, Math.min(20, Math.floor(input.maxJobs ?? 5)))
  const rows = await db.from('cos_university_mass_distillation_batch_runs')
    .select('id,campaign_id,batch_key,candidate_id,subject_id,stage,teacher_job_id,preparation_job_id,training_job_id,failure_reason')
    .eq('stage', 'failed')
    .order('updated_at', { ascending: false })
    .limit(20)
  if (rows.error) throw rows.error

  const diagnostics: Array<Record<string, unknown>> = []
  for (const run of rows.data || []) {
    if (diagnostics.length >= maxJobs) break
    const jobId = clean((run as any).training_job_id || (run as any).preparation_job_id || (run as any).teacher_job_id, 240)
    if (!JOB_ID.test(jobId)) continue
    const candidateId = String((run as any).candidate_id || '')
    if (!candidateId || await alreadyRecorded(candidateId, jobId)) continue
    try {
      const logTail = await fetchHuggingFaceJobLogTail({ namespace, jobId, token: hf.token, limit: 40, fetchImpl: input.fetchImpl })
      await record({
        candidateId,
        subjectId: String((run as any).subject_id || ''),
        campaignId: String((run as any).campaign_id || ''),
        batchKey: String((run as any).batch_key || ''),
        runId: String((run as any).id || ''),
        jobId,
        logTail,
      })
      diagnostics.push({ runId: (run as any).id, jobId, logLines: logTail.length, recorded: true })
    } catch (error) {
      diagnostics.push({
        runId: (run as any).id,
        jobId,
        recorded: false,
        error: clean(error instanceof Error ? error.message : String(error), 200),
      })
    }
  }
  return { ok: true as const, inspected: diagnostics.length, diagnostics, readOnly: true as const }
}
