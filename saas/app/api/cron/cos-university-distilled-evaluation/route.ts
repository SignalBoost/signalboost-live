// saas/app/api/cron/cos-university-distilled-evaluation/route.ts
import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { readPinnedHfParquetRows } from '@/lib/ai/cos/hfPinnedParquetRows'
import {
  distilledEvaluationCallUsageFromError,
  runUniversityDistilledArtifactEvaluation,
} from '@/lib/ai/cos/cosUniversityDistilledArtifactEvaluation'
import { independentEvaluatorConfig } from '@/lib/ai/cos/cosUniversityIndependentEvaluator'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { configuredRunpodApiKey } from '@/lib/ai/cos/runpodConfig'
import { DISTILLED_ADAPTER_MODEL_ID } from '@/lib/ai/cos/runpodServerlessDistilledProvision'
import { isDistilledEvaluationApprovalEvidence } from '@/lib/ai/cos/cosUniversityRuntimeApprovalPolicy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

const HF_HUB_ORIGIN = 'https://huggingface.co'
const HF_ROWS_ORIGIN = 'https://datasets-server.huggingface.co'
// The exact v6 worker has repeatedly needed just over 220 seconds from scale-to-zero to model-ready.
// Allow the gateway's full bounded bootstrap window; the shared 570-second route deadline remains
// authoritative and no additional inference call is used to warm the worker.
const RUNPOD_READY_TIMEOUT_MS = 300_000
const RUNPOD_READY_POLL_MS = 3_000
const RUNPOD_INFERENCE_TIMEOUT_MS = 120_000
const RUNPOD_KEEPALIVE_INTERVAL_MS = 30_000
const RUNPOD_ENDPOINT_PREFLIGHT_TIMEOUT_MS = 8_000
const EVALUATION_ROUTE_BUDGET_MS = 570_000
const EVALUATION_ROUTE_RESERVE_MS = 30_000
const RUNPOD_MAX_GPU_PRICE_USD = 0.69
const RUNPOD_IDLE_TIMEOUT_SECONDS = 60
const MAX_RUNTIME_WAKE_ATTEMPTS = 1
const MAX_RUNTIME_WAKE_COST_USD = 0.2
const RUNTIME_ATTEMPT_PROFILE = 'cos_distilled_independent_evaluation_runtime_v1'
const RUNTIME_ATTEMPT_CLAIM = 'distilled_independent_evaluation_attempt_started'
const RUNPOD_PREFLIGHT_PROFILE = 'cos_distilled_evaluation_runpod_endpoint_preflight_v1'
const RUNPOD_PREFLIGHT_CLAIM = 'runpod_endpoint_preflight_classified'
const HEX40 = /^[a-f0-9]{40}$/i
const HEX64 = /^[a-f0-9]{64}$/i
const RUNPOD_ENDPOINT_HOST = /^[A-Za-z0-9_-]{3,120}\.api\.runpod\.ai$/
const RUNTIME_WAKE_WORST_CASE_COST_USD = (
  ((EVALUATION_ROUTE_BUDGET_MS / 1000) + RUNPOD_IDLE_TIMEOUT_SECONDS) * RUNPOD_MAX_GPU_PRICE_USD
) / 3600

type PinnedDatasetMetadata = Readonly<{
  revision: string
  siblings: ReadonlyArray<Readonly<{ rfilename?: unknown }>>
}>

type RuntimeAttemptClaim = Readonly<{
  ok: true
  candidateId: string
  artifactHash: string
  authorizationObservedAt: string
  authorizationExpiresAt: string
  maxEstimatedRuntimeWakeCostUsd: number
  holdoutCaseCount: number
  maxEndpointCalls: number
  maxJudgeCalls: number
  maxSoloRetryCalls: number
}> | Readonly<{
  ok: false
  reason: string
}>

type SuccessfulRuntimeAttempt = Extract<RuntimeAttemptClaim, { ok: true }>
type EvaluationTransportAudit = Readonly<{
  runtimeAttempt: SuccessfulRuntimeAttempt | null
  endpointCalls: number
}>

type RunpodEndpointClassification = 'available' | 'stale' | 'transient'

type RunpodEndpointPreflight = Readonly<{
  classification: RunpodEndpointClassification
  httpStatus: number | null
  errorName: string | null
  errorMessage: string | null
}>

const TRANSPORT_AUDIT_ERROR_FIELD = 'distilledEvaluationTransportAudit' as const

class RuntimeAttemptSkip extends Error {
  constructor(readonly reason: string) {
    super(reason)
    this.name = 'RuntimeAttemptSkip'
  }
}

function attachEvaluationTransportAudit(error: unknown, audit: EvaluationTransportAudit): Error {
  const failure = error instanceof Error ? error : new Error(String(error))
  try {
    Object.defineProperty(failure, TRANSPORT_AUDIT_ERROR_FIELD, {
      value: Object.freeze({ ...audit }),
      configurable: true,
    })
    return failure
  } catch {
    const wrapper = new Error(failure.message) as Error & Record<string, unknown>
    wrapper.cause = error
    wrapper[TRANSPORT_AUDIT_ERROR_FIELD] = Object.freeze({ ...audit })
    return wrapper
  }
}

function evaluationTransportAuditFromError(error: unknown): EvaluationTransportAudit | null {
  const audit = error && typeof error === 'object'
    ? (error as Record<string, unknown>)[TRANSPORT_AUDIT_ERROR_FIELD]
    : null
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) return null
  const value = audit as Record<string, unknown>
  return Number.isInteger(value.endpointCalls) && Number(value.endpointCalls) >= 0
    ? audit as EvaluationTransportAudit
    : null
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  return input instanceof URL
    ? input.toString()
    : typeof input === 'string'
      ? input
      : input.url
}

function metadataRepoId(url: URL): string | null {
  if (url.origin !== HF_HUB_ORIGIN) return null
  const match = /^\/api\/datasets\/([^/]+)\/([^/]+)$/.exec(url.pathname)
  if (!match) return null
  try {
    return `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`
  } catch {
    return null
  }
}

function isRunpodEvaluationInference(url: URL | null, init?: RequestInit): url is URL {
  if (!url || url.protocol !== 'https:' || !RUNPOD_ENDPOINT_HOST.test(url.hostname)) return false
  const method = String(init?.method || 'GET').toUpperCase()
  return method === 'POST' && url.pathname === '/v1/chat/completions'
}

function requestSignal(input: Parameters<typeof fetch>[0], init?: RequestInit): AbortSignal | null {
  if (init?.signal) return init.signal
  if (typeof input !== 'string' && !(input instanceof URL)) return input.signal
  return null
}

function boundedSignal(existing: AbortSignal | null, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs)))
  return existing ? AbortSignal.any([existing, timeout]) : timeout
}

function routeDeadlineSignal(routeDeadlineMs: number): AbortSignal {
  const remaining = routeDeadlineMs - Date.now() - EVALUATION_ROUTE_RESERVE_MS
  if (remaining <= 0) throw new Error('distilled_evaluation_route_deadline_exceeded')
  return AbortSignal.timeout(Math.max(1, Math.floor(remaining)))
}

async function withinRouteDeadline<T>(work: Promise<T>, routeDeadlineMs: number): Promise<T> {
  const remaining = routeDeadlineMs - Date.now() - EVALUATION_ROUTE_RESERVE_MS
  if (remaining <= 0) throw new Error('distilled_evaluation_route_deadline_exceeded')
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('distilled_evaluation_route_deadline_exceeded')), remaining)
        timer.unref?.()
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function claimRuntimeEvaluationAttempt(now: Date, routeDeadlineMs: number): Promise<RuntimeAttemptClaim> {
  if (RUNTIME_WAKE_WORST_CASE_COST_USD > MAX_RUNTIME_WAKE_COST_USD) {
    throw new Error('distilled_evaluation_runtime_cost_model_exceeds_ceiling')
  }
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')

  const artifactResult = await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,subject_id,trained_artifact_hash,created_at')
    .eq('status', 'evaluation_pending')
    .eq('trained_artifact_id', DISTILLED_ADAPTER_MODEL_ID)
    .order('created_at', { ascending: true })
    .limit(1)
    .abortSignal(routeDeadlineSignal(routeDeadlineMs))
    .maybeSingle()
  if (artifactResult.error) throw artifactResult.error
  if (!artifactResult.data) return { ok: false, reason: 'no_supported_evaluation_pending_artifact' }

  const candidateId = String(artifactResult.data.candidate_id || '').trim()
  const subjectId = String(artifactResult.data.subject_id || '').trim()
  const artifactHash = String(artifactResult.data.trained_artifact_hash || '').trim().toLowerCase()
  if (!candidateId || !subjectId || !HEX64.test(artifactHash)) {
    throw new Error('distilled_evaluation_runtime_artifact_identity_invalid')
  }

  const approvalsResult = await db.from('cos_university_learning_assurance_events')
    .select('evidence,verifier,observed_at,expires_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .order('observed_at', { ascending: false })
    .limit(100)
    .abortSignal(routeDeadlineSignal(routeDeadlineMs))
  if (approvalsResult.error) throw approvalsResult.error
  const nowMs = now.getTime()
  const approval = (approvalsResult.data || []).find((row: any) => {
    const evidence = row?.evidence || {}
    const observedAt = Date.parse(String(row?.observed_at || ''))
    const expiresAt = Date.parse(String(row?.expires_at || ''))
    const runtimeCostCeiling = Number(evidence?.maxEstimatedRuntimeWakeCostUsd || 0)
    return row?.verifier === 'host_controller'
      && isDistilledEvaluationApprovalEvidence(evidence, { candidateId, artifactHash })
      && Number(evidence?.maxRuntimeWakeAttempts || 0) === MAX_RUNTIME_WAKE_ATTEMPTS
      && runtimeCostCeiling >= RUNTIME_WAKE_WORST_CASE_COST_USD
      && runtimeCostCeiling <= MAX_RUNTIME_WAKE_COST_USD
      && evidence?.productionTrafficAuthorized === false
      && evidence?.authorityExpanded === false
      && Number.isFinite(observedAt) && observedAt <= nowMs
      && Number.isFinite(expiresAt) && expiresAt > nowMs
  }) as any
  if (!approval) return { ok: false, reason: 'bounded_runtime_evaluation_authorization_missing_or_expired' }

  const authorizationObservedAt = String(approval.observed_at || '')
  const authorizationExpiresAt = String(approval.expires_at || '')
  const maxEstimatedRuntimeWakeCostUsd = Number(approval.evidence?.maxEstimatedRuntimeWakeCostUsd || 0)
  const holdoutCaseCount = Number(approval.evidence?.holdoutCaseCount)
  const maxEndpointCalls = Number(approval.evidence?.maxEndpointCalls)
  const maxJudgeCalls = Number(approval.evidence?.maxJudgeCalls)
  const maxSoloRetryCalls = Number(approval.evidence?.maxSoloRetryCalls)
  const eventKey = hash([
    RUNTIME_ATTEMPT_PROFILE,
    RUNTIME_ATTEMPT_CLAIM,
    candidateId,
    artifactHash,
    authorizationObservedAt,
  ])
  const evidence = {
    profile: RUNTIME_ATTEMPT_PROFILE,
    claim: RUNTIME_ATTEMPT_CLAIM,
    candidateId,
    artifactHash,
    authorizationObservedAt,
    authorizationExpiresAt,
    maxRuntimeWakeAttempts: MAX_RUNTIME_WAKE_ATTEMPTS,
    maxEstimatedRuntimeWakeCostUsd,
    worstCaseRuntimeWakeCostUsd: Number(RUNTIME_WAKE_WORST_CASE_COST_USD.toFixed(6)),
    routeBudgetMs: EVALUATION_ROUTE_BUDGET_MS,
    routeReserveMs: EVALUATION_ROUTE_RESERVE_MS,
    readyTimeoutMs: RUNPOD_READY_TIMEOUT_MS,
    keepaliveIntervalMs: RUNPOD_KEEPALIVE_INTERVAL_MS,
    holdoutCaseCount,
    endpointCallsCeiling: maxEndpointCalls,
    judgeCallsCeiling: maxJudgeCalls,
    soloRetryCallsCeiling: maxSoloRetryCalls,
    productionTrafficAuthorized: false,
    authorityExpanded: false,
  }
  const insert = await db.from('cos_university_learning_assurance_events').insert({
    event_key: eventKey,
    event_type: 'fine_tune',
    subject_id: subjectId,
    candidate_id: candidateId,
    evidence_hash: hash(evidence),
    evidence,
    verifier: 'host_controller',
    observed_at: now.toISOString(),
  })
    .select('event_key')
    .abortSignal(routeDeadlineSignal(routeDeadlineMs))
    .single()
  if (insert.error) {
    if (String((insert.error as any)?.code || '') === '23505') {
      return { ok: false, reason: 'bounded_runtime_evaluation_attempt_already_consumed' }
    }
    throw insert.error
  }

  return {
    ok: true,
    candidateId,
    artifactHash,
    authorizationObservedAt,
    authorizationExpiresAt,
    maxEstimatedRuntimeWakeCostUsd,
    holdoutCaseCount,
    maxEndpointCalls,
    maxJudgeCalls,
    maxSoloRetryCalls,
  }
}

type RunpodWorkerSnapshot = Readonly<{
  atMs: number
  httpStatus: number | null
  workers: unknown
  jobs: unknown
  error: string | null
}>

type RunpodReadinessTrace = {
  endpointId: string
  windowMs: number
  elapsedMs: number
  probes: number
  statusCounts: Record<string, number>
  timeouts: number
  networkErrors: number
  lastErrorName: string | null
  lastErrorMessage: string | null
  firstHttpResponseAtMs: number | null
  snapshots: RunpodWorkerSnapshot[]
}

// Diagnostic only: the failure receipt of the most recent readiness wait in this invocation.
// The RunPod control-plane health read never wakes billed compute.
let lastRunpodReadinessTrace: RunpodReadinessTrace | null = null
const RUNPOD_HEALTH_SNAPSHOT_INTERVAL_MS = 60_000
const RUNPOD_HEALTH_SNAPSHOT_LIMIT = 7

async function runpodWorkerSnapshot(input: {
  endpointId: string
  key: string
  fetchImpl: typeof fetch
  startedAt: number
}): Promise<RunpodWorkerSnapshot> {
  const atMs = Date.now() - input.startedAt
  try {
    const response = await input.fetchImpl(`https://api.runpod.ai/v2/${input.endpointId}/health`, {
      headers: { Authorization: `Bearer ${input.key}` },
      signal: AbortSignal.timeout(8_000),
    })
    const raw = (await response.text()).slice(0, 2_000)
    let parsed: any = null
    try { parsed = raw ? JSON.parse(raw) : null } catch { parsed = null }
    return {
      atMs,
      httpStatus: response.status,
      workers: parsed?.workers ?? null,
      jobs: parsed?.jobs ?? null,
      error: parsed ? null : raw.replace(/\s+/g, ' ').slice(0, 200) || null,
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error'
    const message = error instanceof Error ? error.message : String(error)
    return { atMs, httpStatus: null, workers: null, jobs: null, error: `${name}:${message}`.slice(0, 200) }
  }
}

async function persistRunpodEndpointClassification(input: {
  endpointId: string
  routeDeadlineMs: number
  preflight: RunpodEndpointPreflight
}): Promise<void> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const artifact = await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,subject_id,trained_artifact_hash,created_at')
    .eq('status', 'evaluation_pending')
    .eq('trained_artifact_id', DISTILLED_ADAPTER_MODEL_ID)
    .order('created_at', { ascending: true })
    .limit(1)
    .abortSignal(routeDeadlineSignal(input.routeDeadlineMs))
    .maybeSingle()
  if (artifact.error) throw artifact.error
  if (!artifact.data) return

  const candidateId = String(artifact.data.candidate_id || '').trim()
  const subjectId = String(artifact.data.subject_id || '').trim()
  const artifactHash = String(artifact.data.trained_artifact_hash || '').trim().toLowerCase()
  if (!candidateId || !subjectId || !HEX64.test(artifactHash)) return

  const evidence = {
    profile: RUNPOD_PREFLIGHT_PROFILE,
    claim: RUNPOD_PREFLIGHT_CLAIM,
    candidateId,
    artifactHash,
    endpointId: input.endpointId,
    classification: input.preflight.classification,
    httpStatus: input.preflight.httpStatus,
    errorName: input.preflight.errorName,
    errorMessage: input.preflight.errorMessage,
    paidRuntimeAttemptConsumed: false,
    productionTrafficAuthorized: false,
    authorityExpanded: false,
  }
  const eventKey = hash([
    RUNPOD_PREFLIGHT_PROFILE,
    RUNPOD_PREFLIGHT_CLAIM,
    candidateId,
    artifactHash,
    input.endpointId,
    input.preflight.classification,
    input.preflight.httpStatus,
    input.preflight.errorName,
  ])
  const insert = await db.from('cos_university_learning_assurance_events').insert({
    event_key: eventKey,
    event_type: 'fine_tune',
    subject_id: subjectId,
    candidate_id: candidateId,
    evidence_hash: hash(evidence),
    evidence,
    verifier: 'host_controller',
    observed_at: new Date().toISOString(),
  })
    .select('event_key')
    .abortSignal(routeDeadlineSignal(input.routeDeadlineMs))
    .single()
  if (insert.error && String((insert.error as any)?.code || '') !== '23505') throw insert.error
}

async function hasPersistedStaleRunpodEndpoint(input: {
  endpointId: string
  routeDeadlineMs: number
}): Promise<boolean> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const artifact = await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,trained_artifact_hash,created_at')
    .eq('status', 'evaluation_pending')
    .eq('trained_artifact_id', DISTILLED_ADAPTER_MODEL_ID)
    .order('created_at', { ascending: true })
    .limit(1)
    .abortSignal(routeDeadlineSignal(input.routeDeadlineMs))
    .maybeSingle()
  if (artifact.error) throw artifact.error
  if (!artifact.data) return false

  const candidateId = String(artifact.data.candidate_id || '').trim()
  const artifactHash = String(artifact.data.trained_artifact_hash || '').trim().toLowerCase()
  if (!candidateId || !HEX64.test(artifactHash)) return false

  const events = await db.from('cos_university_learning_assurance_events')
    .select('evidence,observed_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .order('observed_at', { ascending: false })
    .limit(100)
    .abortSignal(routeDeadlineSignal(input.routeDeadlineMs))
  if (events.error) throw events.error
  return (events.data || []).some((row: any) => {
    const evidence = row?.evidence || {}
    return evidence?.profile === RUNPOD_PREFLIGHT_PROFILE
      && evidence?.claim === RUNPOD_PREFLIGHT_CLAIM
      && String(evidence?.artifactHash || '').toLowerCase() === artifactHash
      && String(evidence?.endpointId || '') === input.endpointId
      && evidence?.classification === 'stale'
  })
}

async function preflightRunpodEndpoint(input: {
  origin: string
  fetchImpl: typeof fetch
  routeDeadlineMs: number
}): Promise<void> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('distilled_evaluation_runpod_key_missing')
  const endpointId = new URL(input.origin).hostname.split('.')[0] || ''
  if (!endpointId) throw new Error('distilled_evaluation_runpod_endpoint_invalid')

  if (await hasPersistedStaleRunpodEndpoint({ endpointId, routeDeadlineMs: input.routeDeadlineMs })) {
    throw new RuntimeAttemptSkip('distilled_evaluation_runpod_endpoint_stale')
  }

  let preflight: RunpodEndpointPreflight
  try {
    const response = await input.fetchImpl(`https://api.runpod.ai/v2/${endpointId}/health`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(RUNPOD_ENDPOINT_PREFLIGHT_TIMEOUT_MS),
    })
    preflight = {
      classification: response.status >= 200 && response.status < 300
        ? 'available'
        : response.status === 404 || response.status === 410
          ? 'stale'
          : 'transient',
      httpStatus: response.status,
      errorName: null,
      errorMessage: response.ok ? null : (await response.text()).replace(/\s+/g, ' ').slice(0, 200) || null,
    }
  } catch (error) {
    preflight = {
      classification: 'transient',
      httpStatus: null,
      errorName: error instanceof Error ? error.name : 'Error',
      errorMessage: (error instanceof Error ? error.message : String(error)).slice(0, 200),
    }
  }

  await persistRunpodEndpointClassification({
    endpointId,
    routeDeadlineMs: input.routeDeadlineMs,
    preflight,
  })

  if (preflight.classification === 'stale') {
    throw new RuntimeAttemptSkip('distilled_evaluation_runpod_endpoint_stale')
  }
  if (preflight.classification === 'transient') {
    throw new RuntimeAttemptSkip('distilled_evaluation_runpod_endpoint_preflight_transient')
  }
}

async function proveRunpodReady(input: {
  origin: string
  fetchImpl: typeof fetch
  routeDeadlineMs: number
}): Promise<void> {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('distilled_evaluation_runpod_key_missing')
  const latestReadyDeadline = input.routeDeadlineMs - EVALUATION_ROUTE_RESERVE_MS
  const deadline = Math.min(Date.now() + RUNPOD_READY_TIMEOUT_MS, latestReadyDeadline)
  if (deadline <= Date.now()) throw new Error('distilled_evaluation_route_deadline_exceeded')
  let lastStatus: number | null = null
  const startedAt = Date.now()
  const endpointId = new URL(input.origin).hostname.split('.')[0] || ''
  const trace: RunpodReadinessTrace = {
    endpointId,
    windowMs: deadline - startedAt,
    elapsedMs: 0,
    probes: 0,
    statusCounts: {},
    timeouts: 0,
    networkErrors: 0,
    lastErrorName: null,
    lastErrorMessage: null,
    firstHttpResponseAtMs: null,
    snapshots: [],
  }
  lastRunpodReadinessTrace = trace
  let nextSnapshotAt = startedAt
  const takeSnapshot = async () => {
    if (trace.snapshots.length >= RUNPOD_HEALTH_SNAPSHOT_LIMIT) return
    trace.snapshots.push(await runpodWorkerSnapshot({ endpointId, key, fetchImpl: input.fetchImpl, startedAt }))
  }

  while (Date.now() < deadline) {
    if (Date.now() >= nextSnapshotAt) {
      nextSnapshotAt = Date.now() + RUNPOD_HEALTH_SNAPSHOT_INTERVAL_MS
      await takeSnapshot().catch(() => undefined)
    }
    const remaining = Math.max(1_000, deadline - Date.now())
    trace.probes += 1
    try {
      const response = await input.fetchImpl(`${input.origin}/ready`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(Math.min(15_000, remaining)),
      })
      lastStatus = response.status
      trace.statusCounts[String(response.status)] = (trace.statusCounts[String(response.status)] || 0) + 1
      if (trace.firstHttpResponseAtMs === null) trace.firstHttpResponseAtMs = Date.now() - startedAt
      if (response.status === 200) return
      if (response.status === 503) {
        const detail = (await response.text()).slice(0, 1_000)
        if (detail.includes('distilled_bootstrap_failed')) {
          throw new Error('distilled_evaluation_runtime_bootstrap_failed')
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'distilled_evaluation_runtime_bootstrap_failed') throw error
      const name = error instanceof Error ? error.name : 'Error'
      if (name === 'TimeoutError' || name === 'AbortError') trace.timeouts += 1
      else trace.networkErrors += 1
      trace.lastErrorName = name
      trace.lastErrorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 200)
      if (Date.now() >= latestReadyDeadline) throw new Error('distilled_evaluation_route_deadline_exceeded')
      lastStatus = null
    }
    if (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, Math.min(RUNPOD_READY_POLL_MS, deadline - Date.now())))
    }
  }

  await takeSnapshot().catch(() => undefined)
  trace.elapsedMs = Date.now() - startedAt
  if (Date.now() >= latestReadyDeadline) throw new Error('distilled_evaluation_route_deadline_exceeded')
  throw new Error(`distilled_evaluation_runtime_not_ready:${lastStatus ?? 'network'}`)
}

/**
 * Private datasets do not reliably expose Dataset Viewer `/rows` or `/first-rows`. Capture the exact
 * Hub revision already fetched by the evaluator, then on a Dataset Viewer provider 5xx read only the
 * pinned holdout Parquet shards from the private Hub repo and synthesize the same `{ rows: [{row}] }`
 * transport shape. The evaluator still performs the authoritative revision, count, SHA-256 item,
 * identity-set, and manifest checks before any model call.
 *
 * All no-cost evaluator preflight runs before a runtime attempt is consumed. Immediately before the
 * first exact RunPod evaluation inference POST can wake billed compute, the route validates the RunPod
 * key, fences stale/nonexistent endpoints through the RunPod control plane, consumes the one durable
 * bounded attempt, and then proves the same origin is `/ready = 200`. A persisted stale classification
 * prevents the same dead endpoint from re-entering the long readiness loop on later cron invocations.
 * The inference timeout starts only after readiness succeeds, so cold-start time cannot consume the
 * request's inference budget before the POST is forwarded. Once ready, a 30-second keepalive prevents
 * the 60-second scale-to-zero runtime from going cold across independent-judge calls. The successful
 * evaluation's manifest-derived approval is also enforced as a hard inference-POST ceiling here.
 */
async function runWithEvaluationTransportGuards<T>(input: {
  runner: () => Promise<T>
  routeDeadlineMs: number
}): Promise<{ result: T; runtimeAttempt: SuccessfulRuntimeAttempt | null; endpointCalls: number }> {
  const originalFetch = globalThis.fetch
  const pinned = new Map<string, PinnedDatasetMetadata>()
  const keepalives = new Map<string, ReturnType<typeof setInterval>>()
  const key = configuredRunpodApiKey()
  let runtimeAttempt: SuccessfulRuntimeAttempt | null = null
  let endpointCalls = 0

  const routeBoundFetch: typeof fetch = async (request, init) => {
    const remaining = input.routeDeadlineMs - Date.now()
    if (remaining <= EVALUATION_ROUTE_RESERVE_MS) {
      throw new Error('distilled_evaluation_route_deadline_exceeded')
    }
    const existing = requestSignal(request, init)
    return originalFetch(request, {
      ...init,
      signal: boundedSignal(existing, remaining - EVALUATION_ROUTE_RESERVE_MS),
    })
  }

  const ensureKeepalive = (origin: string) => {
    if (keepalives.has(origin) || !key) return
    const timer = setInterval(() => {
      if (Date.now() >= input.routeDeadlineMs - EVALUATION_ROUTE_RESERVE_MS) return
      void routeBoundFetch(`${origin}/ready`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => undefined)
    }, RUNPOD_KEEPALIVE_INTERVAL_MS)
    timer.unref?.()
    keepalives.set(origin, timer)
  }

  const patchedFetch: typeof fetch = async (request, init) => {
    const rawUrl = requestUrl(request)
    let url: URL | null = null
    let guardedInit = init
    try { url = new URL(rawUrl) } catch { url = null }

    if (isRunpodEvaluationInference(url, init)) {
      if (!key) throw new Error('distilled_evaluation_runpod_key_missing')
      if (!runtimeAttempt) {
        await preflightRunpodEndpoint({ origin: url.origin, fetchImpl: routeBoundFetch, routeDeadlineMs: input.routeDeadlineMs })
        const claimed = await claimRuntimeEvaluationAttempt(new Date(), input.routeDeadlineMs)
        if (claimed.ok === false) throw new RuntimeAttemptSkip(claimed.reason)
        runtimeAttempt = claimed
      }
      await proveRunpodReady({ origin: url.origin, fetchImpl: routeBoundFetch, routeDeadlineMs: input.routeDeadlineMs })
      ensureKeepalive(url.origin)
      if (endpointCalls >= runtimeAttempt.maxEndpointCalls) {
        throw new Error('distilled_evaluation_endpoint_call_ceiling_exceeded')
      }
      endpointCalls += 1

      const inferenceBudget = input.routeDeadlineMs - Date.now() - EVALUATION_ROUTE_RESERVE_MS
      if (inferenceBudget <= 0) {
        throw new Error('distilled_evaluation_route_deadline_exceeded')
      }
      guardedInit = {
        ...init,
        signal: AbortSignal.timeout(Math.min(RUNPOD_INFERENCE_TIMEOUT_MS, inferenceBudget)),
      }
    }

    const response = await routeBoundFetch(request, guardedInit)

    if (url && response.ok) {
      const repoId = metadataRepoId(url)
      if (repoId) {
        try {
          const metadata: any = await response.clone().json()
          const revision = String(metadata?.sha || '').trim().toLowerCase()
          if (HEX40.test(revision)) {
            pinned.set(repoId, {
              revision,
              siblings: Array.isArray(metadata?.siblings) ? metadata.siblings : [],
            })
          }
        } catch {
          // The evaluator owns metadata validation; absence here simply disables the transport fallback.
        }
      }
    }

    if (response.ok || response.status < 500 || !url) return response
    if (url.origin !== HF_ROWS_ORIGIN || url.pathname !== '/rows') return response

    const repoId = url.searchParams.get('dataset')?.trim() || ''
    const split = url.searchParams.get('split')?.trim() || ''
    const metadata = pinned.get(repoId)
    const token = process.env.HF_TOKEN?.trim() || ''
    if (!metadata || !repoId || !split || token.length < 20) return response

    const rows = await readPinnedHfParquetRows({
      repoId,
      revision: metadata.revision,
      split,
      token,
      siblings: metadata.siblings,
      fetchImpl: routeBoundFetch,
    })
    return new Response(JSON.stringify({
      rows: rows.map((row, rowIdx) => ({ row_idx: rowIdx, row })),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  globalThis.fetch = patchedFetch
  try {
    const result = await input.runner()
    return { result, runtimeAttempt, endpointCalls }
  } catch (error) {
    throw attachEvaluationTransportAudit(error, { runtimeAttempt, endpointCalls })
  } finally {
    for (const timer of keepalives.values()) clearInterval(timer)
    globalThis.fetch = originalFetch
  }
}

async function recordSkip(reason: string) {
  const result = { ok: true as const, skipped: true as const, reason }
  await recordCosUniversityProductionPath({
    path: 'distilled_independent_evaluation',
    invocationSucceeded: true,
    evidence: { ...result, runnerInvoked: false, skipped: true },
  })
  console.info('[cos-distilled-independent-evaluation]', JSON.stringify(result))
  return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const routeDeadlineMs = Date.now() + EVALUATION_ROUTE_BUDGET_MS
  lastRunpodReadinessTrace = null
  try {
    // Confirm evaluator signing is available before any billed runtime attempt can be consumed.
    const evaluator = await withinRouteDeadline(independentEvaluatorConfig(), routeDeadlineMs)
    if (!evaluator) return recordSkip('independent_evaluator_not_configured')
    if (!process.env.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET) {
      process.env.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET = evaluator.secret
    }

    const guarded = await runWithEvaluationTransportGuards({
      routeDeadlineMs,
      runner: () => runUniversityDistilledArtifactEvaluation(new Date()),
    })
    const result = guarded.result
    const runtimeAttempt = guarded.runtimeAttempt
    const skipped = 'skipped' in result && result.skipped === true
    await recordCosUniversityProductionPath({
      path: 'distilled_independent_evaluation',
      invocationSucceeded: result.ok === true,
      evidence: {
        ...result,
        runnerInvoked: !skipped,
        skipped,
        runtimeAttemptAuthorizationObservedAt: runtimeAttempt?.authorizationObservedAt ?? null,
        runtimeWakeCostCeilingUsd: runtimeAttempt?.maxEstimatedRuntimeWakeCostUsd ?? null,
        runtimeEndpointCalls: guarded.endpointCalls,
        runtimeEndpointCallsCeiling: runtimeAttempt?.maxEndpointCalls ?? null,
      },
    })
    console.info('[cos-distilled-independent-evaluation]', JSON.stringify(result))
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    if (error instanceof RuntimeAttemptSkip) return recordSkip(error.reason)
    const message = error instanceof Error ? error.message : String(error)
    const failureAudit = evaluationTransportAuditFromError(error)
    const runtimeAttempt = failureAudit?.runtimeAttempt ?? null
    const callUsage = distilledEvaluationCallUsageFromError(error)
    const readinessTrace = message.startsWith('distilled_evaluation_runtime_not_ready')
      || message === 'distilled_evaluation_route_deadline_exceeded'
      ? lastRunpodReadinessTrace
      : null
    await recordCosUniversityProductionPath({
      path: 'distilled_independent_evaluation',
      invocationSucceeded: false,
      evidence: {
        error: message,
        runnerInvoked: true,
        runtimeAttemptAuthorizationObservedAt: runtimeAttempt?.authorizationObservedAt ?? null,
        runtimeWakeCostCeilingUsd: runtimeAttempt?.maxEstimatedRuntimeWakeCostUsd ?? null,
        runtimeEndpointCalls: failureAudit?.endpointCalls ?? 0,
        runtimeEndpointCallsCeiling: runtimeAttempt?.maxEndpointCalls ?? null,
        endpointCalls: callUsage?.endpointCalls ?? failureAudit?.endpointCalls ?? 0,
        judgeCalls: callUsage?.judgeCalls ?? 0,
        soloRetryCalls: callUsage?.soloRetryCalls ?? 0,
        callCeilings: callUsage ? {
          holdoutCaseCount: callUsage.holdoutCaseCount,
          maxEndpointCalls: callUsage.maxEndpointCalls,
          maxJudgeCalls: callUsage.maxJudgeCalls,
          maxSoloRetryCalls: callUsage.maxSoloRetryCalls,
        } : null,
        ...(readinessTrace ? { readinessTrace } : {}),
      },
    }).catch(() => null)
    console.error('[cos-distilled-independent-evaluation]', JSON.stringify({ ok: false, error: message, readinessTrace }))
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
