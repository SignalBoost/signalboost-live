import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  huggingFaceJobsConfigFromEnv,
  resolveHuggingFaceNamespace,
} from './cosUniversityHuggingFaceJobs.ts'
import {
  conservativeObservedHuggingFaceCostUsd,
  inspectHuggingFaceJob,
} from './cosUniversityHuggingFaceJobReconciler.ts'

const PROFILE = 'cos-university-mass-distillation-provider-ledger-v1' as const
const CALLBACK_GRACE_MS = 120_000
const HEX64 = /^[a-f0-9]{64}$/
type FetchPort = (url: string, init?: RequestInit) => Promise<Response>
type Operation = 'teacher' | 'preparation' | 'training'

function clean(value: unknown, limit = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function finitePositive(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function jobSpecs(run: any): Array<{ operation: Operation; jobId: string; jobUrl: string | null }> {
  return [
    { operation: 'teacher' as const, jobId: clean(run.teacher_job_id, 240), jobUrl: clean(run.teacher_job_url, 2000) || null },
    { operation: 'preparation' as const, jobId: clean(run.preparation_job_id, 240), jobUrl: clean(run.preparation_job_url, 2000) || null },
    { operation: 'training' as const, jobId: clean(run.training_job_id, 240), jobUrl: clean(run.training_job_url, 2000) || null },
  ].filter(item => /^[A-Za-z0-9_-]{3,240}$/.test(item.jobId))
}

async function dispatchEvidence(candidateId: string, jobId: string) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const rows = await db.from('cos_university_learning_assurance_events')
    .select('evidence,observed_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .eq('verifier', 'host_controller')
    .order('observed_at', { ascending: false })
    .limit(40)
  if (rows.error) throw rows.error
  return (rows.data || []).find((row: any) => row?.evidence?.claim === 'mass_distillation_job_dispatched'
    && String(row?.evidence?.jobId || '') === jobId) || null
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
    profile: PROFILE,
    claim: input.claim,
    candidateId: input.candidateId,
    ...input.evidence,
    authorityExpanded: false,
  }
  const evidenceHash = hash(evidence)
  const inserted = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: hash([PROFILE, input.claim, input.candidateId, evidenceHash]),
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

async function hydrateProviderLedger(maxRuns = 8) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const rows = await db.from('cos_university_mass_distillation_batch_runs')
    .select('id,campaign_id,batch_key,candidate_id,subject_id,teacher_job_id,teacher_job_url,preparation_job_id,preparation_job_url,training_job_id,training_job_url')
    .order('updated_at', { ascending: false })
    .limit(maxRuns)
  if (rows.error) throw rows.error

  let hydrated = 0
  let missingDispatchEvidence = 0
  for (const run of rows.data || []) {
    for (const job of jobSpecs(run)) {
      const existing = await db.from('cos_university_mass_distillation_provider_jobs')
        .select('job_id')
        .eq('job_id', job.jobId)
        .maybeSingle()
      if (existing.error) throw existing.error
      if (existing.data) continue

      const dispatch = await dispatchEvidence(String((run as any).candidate_id), job.jobId)
      const evidence: any = dispatch?.evidence
      const idempotencyKey = clean(evidence?.idempotencyKey, 64).toLowerCase()
      const reservedCostUsd = finitePositive(evidence?.reservedCostCeilingUsd)
      const hourlyCostUsd = finitePositive(evidence?.hourlyCostUsd)
      const timeoutSeconds = finitePositive(evidence?.timeoutSeconds)
      if (!dispatch || !HEX64.test(idempotencyKey) || reservedCostUsd === null || hourlyCostUsd === null || timeoutSeconds === null) {
        missingDispatchEvidence += 1
        continue
      }

      const inserted = await db.from('cos_university_mass_distillation_provider_jobs').upsert({
        campaign_id: (run as any).campaign_id,
        run_id: (run as any).id,
        batch_key: (run as any).batch_key,
        candidate_id: (run as any).candidate_id,
        subject_id: (run as any).subject_id,
        operation: job.operation,
        job_id: job.jobId,
        job_url: job.jobUrl,
        idempotency_key: idempotencyKey,
        reserved_cost_usd: reservedCostUsd,
        hourly_cost_usd: hourlyCostUsd,
        timeout_seconds: Math.floor(timeoutSeconds),
        dispatched_at: dispatch.observed_at,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'job_id', ignoreDuplicates: true })
      if (inserted.error) throw inserted.error
      hydrated += 1
    }
  }
  return { hydrated, missingDispatchEvidence }
}

function expectedDispatchedStage(operation: Operation): string {
  if (operation === 'teacher') return 'teacher_dispatched'
  if (operation === 'preparation') return 'preparation_dispatched'
  return 'training_dispatched'
}

export async function reconcileMassDistillationHuggingFaceProviderLedger(input: {
  now?: Date
  maxJobs?: number
  fetchImpl?: FetchPort
} = {}) {
  const hf = huggingFaceJobsConfigFromEnv()
  if (!hf) return { ok: false as const, skipped: true as const, reason: 'huggingface_not_configured' as const }
  const db = cosServiceDb()
  if (!db) return { ok: false as const, skipped: true as const, reason: 'service_database_unavailable' as const }
  const namespace = await resolveHuggingFaceNamespace({ token: hf.token, fetchImpl: input.fetchImpl })
  const maxJobs = Math.max(1, Math.min(10, Math.floor(input.maxJobs ?? 5)))
  // Ledger hydration is legacy backfill, not the dispatch critical path. Keep it deliberately small
  // so a growing run history cannot turn every Supervisor tick into dozens of sequential PostgREST calls.
  const hydration = await hydrateProviderLedger(Math.max(3, Math.min(8, maxJobs)))
  const now = input.now || new Date()

  const rows = await db.from('cos_university_mass_distillation_provider_jobs')
    .select('id,campaign_id,run_id,batch_key,candidate_id,subject_id,operation,job_id,reserved_cost_usd,hourly_cost_usd,timeout_seconds,provider_stage,updated_at,dispatched_at')
    .is('settled_at', null)
    .order('dispatched_at', { ascending: true })
    .limit(maxJobs)
  if (rows.error) throw rows.error

  const observations: Array<Record<string, unknown>> = []
  for (const row of rows.data || []) {
    const operation = String((row as any).operation) as Operation
    const jobId = String((row as any).job_id)
    const job = await inspectHuggingFaceJob({ namespace, jobId, token: hf.token, fetchImpl: input.fetchImpl })

    if (job.stage === 'SCHEDULING' || job.stage === 'RUNNING') {
      const dispatchedAt = Date.parse(String((row as any).dispatched_at || ''))
      const timeoutSeconds = Number((row as any).timeout_seconds || 0)
      const overdue = Number.isFinite(dispatchedAt) && timeoutSeconds > 0
        ? now.getTime() > dispatchedAt + (timeoutSeconds + 120) * 1000
        : false
      observations.push({ jobId, operation, providerStage: job.stage, overdue })
      continue
    }

    const runResult = await db.from('cos_university_mass_distillation_batch_runs')
      .select('stage')
      .eq('id', (row as any).run_id)
      .maybeSingle()
    if (runResult.error) throw runResult.error
    const runStage = String((runResult.data as any)?.stage || '')

    if (job.stage === 'COMPLETED' && runStage === expectedDispatchedStage(operation)) {
      const alreadyObserved = String((row as any).provider_stage || '') === 'COMPLETED'
      const firstObservedAt = Date.parse(String((row as any).updated_at || ''))
      if (!alreadyObserved) {
        const marked = await db.from('cos_university_mass_distillation_provider_jobs')
          .update({ provider_stage: 'COMPLETED', updated_at: now.toISOString() })
          .eq('id', (row as any).id)
          .is('settled_at', null)
        if (marked.error) throw marked.error
        observations.push({ jobId, operation, providerStage: 'COMPLETED', waitingForCallback: true })
        continue
      }
      if (!Number.isFinite(firstObservedAt) || now.getTime() - firstObservedAt < CALLBACK_GRACE_MS) {
        observations.push({ jobId, operation, providerStage: 'COMPLETED', waitingForCallback: true })
        continue
      }
    }

    const observedCostUsd = conservativeObservedHuggingFaceCostUsd({
      job,
      hourlyCostUsd: Number((row as any).hourly_cost_usd),
      reservedCostUsd: Number((row as any).reserved_cost_usd),
    })
    const failureReason = job.stage === 'COMPLETED'
      ? (runStage === expectedDispatchedStage(operation) ? 'huggingface_completed_without_callback' : null)
      : `huggingface_provider_${job.stage.toLowerCase()}${job.message ? `:${clean(job.message, 180)}` : ''}`
    const settled = await db.rpc('settle_cos_university_mass_distillation_provider_job', {
      p_job_id: jobId,
      p_provider_stage: job.stage,
      p_failure_reason: failureReason,
      p_observed_cost_usd: observedCostUsd,
    })
    if (settled.error) throw settled.error

    await recordObservation({
      candidateId: String((row as any).candidate_id),
      subjectId: String((row as any).subject_id),
      claim: 'mass_distillation_provider_job_settled',
      evidence: {
        campaignId: (row as any).campaign_id,
        batchKey: (row as any).batch_key,
        runId: (row as any).run_id,
        jobId,
        operation,
        providerStage: job.stage,
        observedCostUsd,
        reservedCostUsd: Number((row as any).reserved_cost_usd),
        settlement: settled.data,
        automaticRetryAuthorized: false,
      },
    })
    observations.push({ jobId, operation, providerStage: job.stage, settled: true, observedCostUsd })
  }

  return {
    ok: true as const,
    hydrated: hydration.hydrated,
    missingDispatchEvidence: hydration.missingDispatchEvidence,
    inspected: (rows.data || []).length,
    observations,
    semantics: 'accepted_provider_jobs_settle_after_callback_without_losing_budget_evidence' as const,
  }
}
