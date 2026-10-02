import { createHash } from 'node:crypto'
import { after } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { CosReasoningWorkerRole } from '@/lib/ai/cos/cosReasoningControlPlane'

export type GraduateServingAttemptPhase = 'attempt_started' | 'attempt_succeeded' | 'attempt_failed' | 'fallback'
export type GraduateServingAttemptOutcome = 'pending' | 'success' | 'empty' | 'timeout' | 'error' | 'fallback'

export type GraduateServingAttemptInput = Readonly<{
  attemptId: string
  correlationId?: string
  registryId: string
  candidateId: string
  trainedArtifactHash: string
  subjectId: string
  problemClass: string
  workerRole: CosReasoningWorkerRole
  runtimeProvider: string
  runtimeModelId: string
  runtimeBaseUrl: string
  phase: GraduateServingAttemptPhase
  outcome: GraduateServingAttemptOutcome
  timeoutMs?: number
  latencyMs?: number
  errorClass?: string
}>

function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function safeRuntimeBaseUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ''))
    return `${url.protocol}//${url.host}${url.pathname}`.slice(0, 1000)
  } catch {
    return ''
  }
}

function classifyError(error: unknown, timeoutMs?: number, latencyMs?: number): 'timeout' | 'error' {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const name = error instanceof Error ? error.name : ''
  if (/timeout|timed out|abort/i.test(`${name} ${message}`)) return 'timeout'
  if (Number.isFinite(timeoutMs) && Number.isFinite(latencyMs) && Number(latencyMs) >= Number(timeoutMs) - 50) return 'timeout'
  return 'error'
}

export function graduateServingErrorOutcome(error: unknown, timeoutMs?: number, latencyMs?: number) {
  return classifyError(error, timeoutMs, latencyMs)
}

async function enqueueGraduateServingEvidence(input: GraduateServingAttemptInput): Promise<void> {
  const db = cosServiceDb()
  if (!db) throw new Error('cos_service_db_unavailable')
  const eventKey = `serving:${clean(input.attemptId, 80)}:${input.phase}`
  const result = await db.from('cos_workforce_evidence_outbox').upsert({
    event_key: eventKey,
    event_kind: 'serving_attempt',
    payload: input,
    status: 'pending',
    next_attempt_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
}

async function persistGraduateServingAttempt(input: GraduateServingAttemptInput): Promise<void> {
  try {
    const db = cosServiceDb()
    if (!db) return
    const result = await db.from('cos_university_graduate_serving_attempts').insert({
      attempt_id: clean(input.attemptId, 80),
      correlation_id: clean(input.correlationId, 200) || null,
      registry_id: clean(input.registryId, 80),
      candidate_id: clean(input.candidateId, 500),
      trained_artifact_hash: clean(input.trainedArtifactHash, 80),
      subject_id: clean(input.subjectId, 240),
      problem_class: clean(input.problemClass || 'general reasoning', 500),
      worker_role: input.workerRole,
      runtime_provider: clean(input.runtimeProvider, 120),
      runtime_model_id: clean(input.runtimeModelId, 500),
      runtime_base_url: safeRuntimeBaseUrl(input.runtimeBaseUrl),
      phase: input.phase,
      outcome: input.outcome,
      timeout_ms: Number.isFinite(input.timeoutMs) ? Math.max(0, Math.round(Number(input.timeoutMs))) : null,
      latency_ms: Math.max(0, Math.round(Number(input.latencyMs) || 0)),
      error_class: clean(input.errorClass, 120) || null,
      recorded_at: new Date().toISOString(),
    })
    if (result.error) throw result.error
    const lifecycleType = input.phase === 'attempt_started'
      ? 'serving_started'
      : input.phase === 'attempt_succeeded'
        ? 'serving_succeeded'
        : input.phase === 'attempt_failed'
          ? 'serving_failed'
          : null
    if (lifecycleType) {
      const evidence = {
        phase: input.phase,
        outcome: input.outcome,
        problemClass: clean(input.problemClass || 'general reasoning', 500),
        workerRole: input.workerRole,
        runtimeProvider: clean(input.runtimeProvider, 120),
        runtimeModelId: clean(input.runtimeModelId, 500),
        timeoutMs: Number.isFinite(input.timeoutMs) ? Math.max(0, Math.round(Number(input.timeoutMs))) : null,
        latencyMs: Math.max(0, Math.round(Number(input.latencyMs) || 0)),
        errorClass: clean(input.errorClass, 120) || null,
        authorityExpanded: false,
      }
      const evidenceHash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
      const lifecycle = await db.rpc('append_cos_graduate_lifecycle_event', {
        p_registry_id: clean(input.registryId, 80),
        p_candidate_id: clean(input.candidateId, 500),
        p_trained_artifact_hash: clean(input.trainedArtifactHash, 80),
        p_event_type: lifecycleType,
        p_correlation_id: clean(input.correlationId || input.attemptId, 200),
        p_evidence_hash: evidenceHash,
        p_evidence: evidence,
        p_observed_at: new Date().toISOString(),
      })
      if (lifecycle.error) throw lifecycle.error
    }
  } catch (error) {
    console.warn('[cos-graduate-serving-attempt] persistence failed (non-fatal):', error instanceof Error ? error.message : String(error))
  }
}

export function recordGraduateServingAttempt(input: GraduateServingAttemptInput): void {
  const persist = async () => {
    // Evidence enters a durable outbox before best-effort immediate materialization. The Workforce
    // recovery cron drains pending rows, so a transient lifecycle/table failure cannot silently erase work history.
    let queued = false
    for (let attempt = 0; attempt < 3 && !queued; attempt += 1) {
      try {
        await enqueueGraduateServingEvidence(input)
        queued = true
      } catch (error) {
        if (attempt === 2) console.error('[cos-workforce-evidence] outbox enqueue failed after retries:', error instanceof Error ? error.message : String(error))
        else await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)))
      }
    }
    if (queued) await persistGraduateServingAttempt(input)
  }
  try {
    after(persist)
  } catch {
    void persist()
  }
}

/** Governed outbox drain used by the Workforce recovery cron. Idempotent by event_key. */
export async function drainGraduateServingEvidence(limit = 100): Promise<{ delivered: number; blocked: number }> {
  const db = cosServiceDb()
  if (!db) return { delivered: 0, blocked: 0 }
  const rows = await db.from('cos_workforce_evidence_outbox')
    .select('id,payload,attempts')
    .eq('event_kind', 'serving_attempt')
    .in('status', ['pending','processing'])
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 500)))
  if (rows.error) throw rows.error
  let delivered = 0
  let blocked = 0
  for (const raw of rows.data || []) {
    const row = raw as { id: string; payload: GraduateServingAttemptInput; attempts?: number }
    const attempts = Math.max(0, Number(row.attempts) || 0) + 1
    try {
      await persistGraduateServingAttempt(row.payload)
      const done = await db.from('cos_workforce_evidence_outbox').update({
        status: 'delivered', attempts, delivered_at: new Date().toISOString(), last_error: null,
      }).eq('id', row.id)
      if (done.error) throw done.error
      delivered += 1
    } catch (error) {
      const terminal = attempts >= 12
      const retryAt = new Date(Date.now() + Math.min(60 * 60_000, 2 ** Math.min(attempts, 10) * 1_000)).toISOString()
      await db.from('cos_workforce_evidence_outbox').update({
        status: terminal ? 'blocked' : 'pending',
        attempts,
        next_attempt_at: retryAt,
        last_error: clean(error instanceof Error ? error.message : String(error), 1000),
      }).eq('id', row.id)
      if (terminal) blocked += 1
    }
  }
  return { delivered, blocked }
}
