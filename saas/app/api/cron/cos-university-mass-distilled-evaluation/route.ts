// saas/app/api/cron/cos-university-mass-distilled-evaluation/route.ts
import { createHash } from 'node:crypto'
import { MASS_EVALUATION_ENDPOINT_CALLS } from '../../../../lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts'
import { isTerminalHoldoutDataDefect } from '@/lib/ai/cos/cosUniversityMassEvaluationTerminalDefect'
import { REQUIRED_EVALUATION_RUN_COLUMNS, isMissingColumnError, missingColumnsFromError } from '@/lib/ai/cos/cosUniversityEvaluationSchemaPreflight'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { queryRunpodAccountStatus } from '@/lib/hub/runpodTelemetry'
import { independentEvaluatorConfig } from '@/lib/ai/cos/cosUniversityIndependentEvaluator'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { ensureMassDistilledEndpoint24Gb, massDistilledServerlessWorkerCapacity } from '@/lib/ai/cos/runpodMassDistilledProvisionV2'
import { activeEvaluationRunpodEndpointIds } from '@/lib/ai/cos/cosUniversityGraduateEndpointProtection'
import { configuredRunpodApiKey } from '@/lib/ai/cos/runpodConfig'
import { BUILDER_RESIDENCY_PROGRAM_ID, isBuilderResidencySubject } from '@/lib/ai/cos/cosUniversityResidency'
import { runpodServerlessRootUrl } from '@/lib/ai/cos/runpodServerlessDistilledProvision'
import {
  runMassDistilledArtifactEvaluation,
  type MassEvaluationClaim,
} from '@/lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation'
import {
  MASS_EVALUATION_APPROVAL_TTL_MS,
  MASS_EVALUATION_BUILDER_V2_OPTIMIZER,
  MASS_EVALUATION_BUILDER_V2_PROOF_SAMPLE,
  MASS_EVALUATION_REMEDIATION_REPLAY_PROOF_SAMPLE,
  MASS_EVALUATION_FRONTIER_PROOF_SAMPLE,
  decideExhaustedMassEvaluationArtifacts,
  decideRollingMassEvaluationApproval,
  type ExhaustedMassEvaluationArtifact,
  type RollingArtifact,
  type RollingEvent,
} from '@/lib/ai/cos/cosUniversityMassEvaluationRollingAuthority'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

const PROFILE = 'cos_mass_distilled_independent_evaluation_runtime_v1'
const COMPLETED = 'mass_distilled_independent_evaluation_completed'
const FAILED = 'mass_distilled_independent_evaluation_failed'
const EXHAUSTED = 'mass_distilled_evaluation_attempts_exhausted'
const ROUTE_BUDGET_MS = 570_000
const ROUTE_RESERVE_MS = 25_000
const RUNTIME_WAKE_TIMEOUT_MS = 20_000
const MIN_BALANCE_USD = 1
const ROLLING_EVENT_PAGE_SIZE = 1000
const ROLLING_EVENT_MAX_PAGES = 10
const ROLLING_CANDIDATE_CHUNK_SIZE = 75
const HEX64 = /^[a-f0-9]{64}$/i
const ENDPOINT_ID = /^[A-Za-z0-9_-]{3,120}$/

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const clean = (value: unknown, max = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function boundedErrorMessage(error: unknown): string {
  if (error instanceof Error) return clean(error.message, 500)
  if (error && typeof error === 'object') {
    const row = error as Record<string, unknown>
    const code = clean(row.code, 80)
    const message = clean(row.message, 400)
    if (message) return clean(code ? `${code}:${message}` : message, 500)
    const name = clean(row.name, 80)
    if (name) return name
    return 'structured_error_without_message'
  }
  return clean(String(error), 500)
}

async function recordProduction(invocationSucceeded: boolean, evidence: Record<string, unknown>) {
  await recordCosUniversityProductionPath({
    path: 'mass_distilled_independent_evaluation',
    invocationSucceeded,
    evidence,
  })
}

async function wakeMassDistilledRuntime(endpointId: string, deadlineMs: number) {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('mass_distilled_evaluation_runpod_key_missing')
  const remainingMs = deadlineMs - Date.now() - ROUTE_RESERVE_MS
  if (remainingMs <= 0) throw new Error('mass_distilled_evaluation_route_deadline_exceeded')
  const timeoutMs = Math.max(1, Math.min(RUNTIME_WAKE_TIMEOUT_MS, remainingMs))
  // /ping is only a scale-from-zero trigger. A cold RunPod LB request can stay open until a worker is
  // routable, so waiting minutes for its response consumes the evaluator's entire route budget. Dispatch
  // it briefly, then let the evaluator's /ready loop own startup readiness and the remaining deadline.
  try {
    const response = await fetch(`${runpodServerlessRootUrl(endpointId)}/ping`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 300)
      throw new Error(`mass_distilled_evaluation_runtime_wake_http_${response.status}:${detail}`)
    }
    const payload: any = await response.json().catch(() => null)
    if (String(payload?.status || '') !== 'accepting_requests') {
      throw new Error('mass_distilled_evaluation_runtime_wake_invalid')
    }
    return Object.freeze({
      ok: true as const,
      endpointId,
      responseObserved: true,
      modelReady: payload?.modelReady === true,
      tokenGeneratingRequest: false,
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name !== 'TimeoutError' && name !== 'AbortError') throw error
    return Object.freeze({
      ok: true as const,
      endpointId,
      responseObserved: false,
      modelReady: false,
      wakeRequestTimedOut: true,
      tokenGeneratingRequest: false,
    })
  }
}

type RawClaim = Readonly<{
  candidate_id: string
  subject_id: string
  artifact_id: string
  artifact_hash: string
  revision_key: string
  dataset_hash: string
  endpoint_id: string
  approval_observed_at: string
  max_endpoint_calls: number
  max_judge_calls: number
  max_runtime_wake_attempts: number
  max_estimated_runtime_wake_cost_usd: number
  reservation_event_key: string
}>

// An artifact that has spent its substantive attempt budget can never be approved again, yet nothing moved it
// out of `evaluation_pending`. It stayed in this lane's selection window - the bounded pending selection window - so a
// run of dead artifacts at the front of the queue starves every newer artifact behind them, while the lane
// reports them as waiting. Give them the terminal status their verdict already implies, and record WHY in the
// same ledger the evaluation writes to, so a real failure is visible to curriculum work instead of vanishing.
//
// The status write is conditioned on `evaluation_pending`, so re-running it changes nothing, and the event is
// upserted on a deterministic key. This disposes; it never evaluates, scores, promotes or spends.
async function disposeExhaustedArtifacts(
  items: readonly ExhaustedMassEvaluationArtifact[],
  now: Date,
): Promise<ExhaustedMassEvaluationArtifact[]> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const disposed: ExhaustedMassEvaluationArtifact[] = []
  for (const item of items) {
    const updated = await db.from('cos_local_distillation_artifacts')
      .update({ status: 'quarantined', updated_at: now.toISOString() })
      .eq('candidate_id', item.candidateId)
      .eq('trained_artifact_hash', item.artifactHash)
      .eq('status', 'evaluation_pending')
    if (updated.error) throw updated.error

    const body = {
      profile: PROFILE,
      claim: EXHAUSTED,
      candidateId: item.candidateId,
      artifactHash: item.artifactHash,
      reason: item.reason,
      failedAttempts: item.failedAttempts,
      lastError: clean(item.lastError, 500),
      nextStatus: 'quarantined',
      terminalDisposition: true,
      evaluationPassed: false,
      productionTrafficAuthorized: false,
      authorityExpanded: false,
    }
    const inserted = await db.from('cos_university_learning_assurance_events').upsert({
      event_key: hash([PROFILE, EXHAUSTED, item.candidateId, item.artifactHash]),
      event_type: 'fine_tune',
      subject_id: item.subjectId || null,
      candidate_id: item.candidateId,
      evidence_hash: hash(body),
      evidence: body,
      verifier: 'host_controller',
      observed_at: now.toISOString(),
    }, { onConflict: 'event_key', ignoreDuplicates: true })
    if (inserted.error) throw inserted.error
    disposed.push(item)
  }
  return disposed
}

type RollingOutcome = Readonly<{
  issued: boolean
  reason?: string
  candidateId?: string
  artifactHash?: string
  disposed?: number
}>

function isBuilderV2Receipt(intendedUse: unknown): boolean {
  if (!intendedUse || typeof intendedUse !== 'object' || Array.isArray(intendedUse)) return false
  const receipt = (intendedUse as any).trainingReceipt
  return Boolean(receipt && typeof receipt === 'object'
    && receipt.optimizer === MASS_EVALUATION_BUILDER_V2_OPTIMIZER
    && receipt.frontierResponseAnchorRequired === true
    && Number(receipt.frontierResponseAnchorEpochs) === 1
    && Number(receipt.frontierResponseAnchorItems) > 0)
}

function isRemediationReplayReceipt(intendedUse: unknown): boolean {
  if (!intendedUse || typeof intendedUse !== 'object' || Array.isArray(intendedUse)) return false
  const receipt = (intendedUse as any).trainingReceipt
  return Boolean(receipt && typeof receipt === 'object'
    && receipt.failureDerivedReplayRequired === true
    && Number(receipt.failureDerivedReplayItems) > 0)
}

async function builderResidencyCompletions(db: any, artifacts: any[]) {
  const builderArtifacts = artifacts.filter((row: any) => isBuilderResidencySubject(row?.subject_id))
  const candidateIds = [...new Set(builderArtifacts.map((row: any) => clean(row?.candidate_id, 240)).filter(Boolean))]
  const completions = new Map<string, string>()
  if (!candidateIds.length) return completions
  const result = await db.from('cos_university_residency_enrollments')
    .select('candidate_id,trained_artifact_hash,standing,completed_at')
    .eq('program_id', BUILDER_RESIDENCY_PROGRAM_ID)
    .eq('standing', 'residency_complete')
    .in('candidate_id', candidateIds)
    .limit(1000)
  if (result.error) throw new Error(`mass_distilled_evaluation_residency_read_failed:${boundedErrorMessage(result.error)}`)
  for (const row of result.data || []) {
    const candidateId = clean((row as any).candidate_id, 240)
    const artifactHash = clean((row as any).trained_artifact_hash, 64).toLowerCase()
    const completedAt = clean((row as any).completed_at, 80)
    if (candidateId && HEX64.test(artifactHash) && Number.isFinite(Date.parse(completedAt))) {
      completions.set(candidateId + ':' + artifactHash, completedAt)
    }
  }
  return completions
}

async function ensureRollingMassEvaluationApproval(): Promise<RollingOutcome> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  // Keep normal queue work bounded to the oldest 500, but explicitly include the small confirmed-v2
  // Computer Science proof cohort. Otherwise a growing legacy backlog can make the priority policy unreachable.
  const [oldestArtifacts, builderV2Artifacts, replayArtifacts] = await Promise.all([
    db.from('cos_local_distillation_artifacts')
      .select('candidate_id,subject_id,trained_artifact_hash,created_at,intended_use')
      .eq('status', 'evaluation_pending')
      .like('candidate_id', 'mass:%')
      .order('created_at', { ascending: true })
      .limit(500),
    db.from('cos_local_distillation_artifacts')
      .select('candidate_id,subject_id,trained_artifact_hash,created_at,intended_use')
      .eq('status', 'evaluation_pending')
      .eq('subject_id', 'Computer Science & Coding')
      .like('candidate_id', 'mass:%')
      .order('created_at', { ascending: true })
      .limit(500),
    db.from('cos_local_distillation_artifacts')
      .select('candidate_id,subject_id,trained_artifact_hash,created_at,intended_use')
      .eq('status', 'evaluation_pending')
      .like('candidate_id', 'mass:%')
      .contains('intended_use', { trainingReceipt: { failureDerivedReplayRequired: true } })
      .order('created_at', { ascending: true })
      .limit(100),
  ])
  if (oldestArtifacts.error) throw oldestArtifacts.error
  if (builderV2Artifacts.error) throw builderV2Artifacts.error
  if (replayArtifacts.error) throw replayArtifacts.error
  const confirmedBuilderV2Artifacts = (builderV2Artifacts.data || [])
    .filter((row: any) => isBuilderV2Receipt(row?.intended_use))
  const confirmedReplayArtifacts = (replayArtifacts.data || [])
    .filter((row: any) => isRemediationReplayReceipt(row?.intended_use))
  const artifactByCandidate = new Map<string, any>()
  for (const row of [...(oldestArtifacts.data || []), ...confirmedBuilderV2Artifacts, ...confirmedReplayArtifacts]) {
    artifactByCandidate.set(String((row as any).candidate_id), row)
  }
  const unfilteredArtifactRows = [...artifactByCandidate.values()]
  const residencyCompletions = await builderResidencyCompletions(db, unfilteredArtifactRows)
  const artifactRows = unfilteredArtifactRows.filter((row: any) => {
    if (!isBuilderResidencySubject(row?.subject_id)) return true
    const key = clean(row?.candidate_id, 240) + ':' + clean(row?.trained_artifact_hash, 64).toLowerCase()
    return residencyCompletions.has(key)
  })
  const rows: RollingArtifact[] = artifactRows.map((row: any) => {
    const receipt = row?.intended_use?.trainingReceipt && typeof row.intended_use.trainingReceipt === 'object'
      ? row.intended_use.trainingReceipt
      : {}
    return {
      candidateId: clean(row.candidate_id, 240), subjectId: clean(row.subject_id, 240),
      artifactHash: clean(row.trained_artifact_hash, 64).toLowerCase(), createdAt: String(row.created_at || ''),
      frontierRecipe: receipt.profile === 'cos_university_frontier_gkd_v1',
      builderV2: String(row.subject_id || '') === 'Computer Science & Coding'
        && isBuilderV2Receipt(row.intended_use),
      remediationReplay: isRemediationReplayReceipt(row.intended_use),
    }
  })
  if (!rows.length) return { issued: false, reason: 'no_mass_artifact_pending' }
  // Scope evidence to the pending candidates being evaluated this tick. Supabase/PostgREST can cap
  // broad result sets below the requested limit; a global newest-events query can therefore evict
  // older exact-canary evidence and make eligible artifacts appear permanently ineligible.
  const candidateIds = rows.map(row => row.candidateId)
  // A single global row cap silently drops the OLDEST rows first, which is exactly where an artifact's exact
  // canary lives. Scope every read to the candidates actually under consideration and page through them, so an
  // older canary can never fall out of the window and make a genuinely eligible artifact look unproven.
  const eventRows: any[] = []
  const reservationRows: any[] = []
  // A 500-candidate PostgREST .in(...) filter is roughly 32 KB before URL encoding in Production.
  // That exceeds safe request-line limits and was returning HTTP 400 before any evaluator claim could run.
  // Preserve the exact candidate set and complete pagination, but split only the transport into bounded chunks.
  for (let offset = 0; offset < candidateIds.length; offset += ROLLING_CANDIDATE_CHUNK_SIZE) {
    const candidateChunk = candidateIds.slice(offset, offset + ROLLING_CANDIDATE_CHUNK_SIZE)
    for (let page = 0; page < ROLLING_EVENT_MAX_PAGES; page += 1) {
      const from = page * ROLLING_EVENT_PAGE_SIZE
      const to = from + ROLLING_EVENT_PAGE_SIZE - 1
      const result = await db.from('cos_university_learning_assurance_events')
        .select('event_key,candidate_id,observed_at,expires_at,verifier,evidence')
        .eq('event_type', 'fine_tune')
        .in('candidate_id', candidateChunk)
        .in('verifier', ['host_controller', 'host_production_verifier', 'independent_scorer'])
        .gte('observed_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
        .order('observed_at', { ascending: false })
        .range(from, to)
      if (result.error) throw new Error(`mass_distilled_evaluation_event_read_failed:${boundedErrorMessage(result.error)}`)
      const batch = result.data || []
      eventRows.push(...batch)
      if (batch.length < ROLLING_EVENT_PAGE_SIZE) break
    }
    for (let page = 0; page < ROLLING_EVENT_MAX_PAGES; page += 1) {
      const from = page * ROLLING_EVENT_PAGE_SIZE
      const to = from + ROLLING_EVENT_PAGE_SIZE - 1
      const result = await db.from('cos_university_learning_assurance_events')
        .select('event_key,candidate_id,observed_at,expires_at,verifier,evidence')
        .eq('event_type', 'fine_tune')
        .in('candidate_id', candidateChunk)
        .contains('evidence', { profile: 'cos_mass_distilled_independent_evaluation_runtime_v1' })
        .gte('observed_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
        .order('observed_at', { ascending: false })
        .range(from, to)
      if (result.error) throw new Error(`mass_distilled_evaluation_reservation_read_failed:${boundedErrorMessage(result.error)}`)
      const batch = result.data || []
      reservationRows.push(...batch)
      if (batch.length < ROLLING_EVENT_PAGE_SIZE) break
    }
  }
  const seenEventKeys = new Set<string>()
  const uniqueRows = [...eventRows, ...reservationRows].filter((row: any) => {
    const key = String(row?.event_key || '')
    if (!key) return true
    if (seenEventKeys.has(key)) return false
    seenEventKeys.add(key)
    return true
  })
  uniqueRows.sort((left: any, right: any) =>
    Date.parse(String(right?.observed_at || '')) - Date.parse(String(left?.observed_at || '')))
  const artifactByCandidateForResidency = new Map(artifactRows.map((row: any) => [clean(row?.candidate_id, 240), row]))
  const policyRows = uniqueRows.filter((row: any) => {
    if (String(row?.evidence?.claim || '') !== 'production_canary_healthy') return true
    const candidateId = clean(row?.candidate_id, 240)
    const artifact = artifactByCandidateForResidency.get(candidateId) as any
    if (!artifact || !isBuilderResidencySubject(artifact?.subject_id)) return true
    const artifactHash = clean(row?.evidence?.artifactHash, 64).toLowerCase()
    const completedAt = residencyCompletions.get(candidateId + ':' + artifactHash)
    return Boolean(completedAt) && Date.parse(String(row?.observed_at || '')) >= Date.parse(String(completedAt))
  })
  const all: RollingEvent[] = policyRows.map((row: any) => ({
    candidateId: clean(row.candidate_id, 240), observedAt: String(row.observed_at || ''), expiresAt: row.expires_at ? String(row.expires_at) : null,
    verifier: clean(row.verifier, 80), evidence: row.evidence && typeof row.evidence === 'object' ? row.evidence : null,
  }))
  const now = new Date()
  const inFlightCount = (await activeEvaluationRunpodEndpointIds(now)).size

  const remediationReplayCanaryPasses = new Set(rows
    .filter(row => row.remediationReplay === true)
    .filter(row => all.some(event => event.candidateId === row.candidateId
      && event.verifier === 'host_production_verifier'
      && event.evidence?.claim === 'production_canary_healthy'
      && event.evidence?.exactArtifact === true
      && String(event.evidence?.artifactHash || '').toLowerCase() === row.artifactHash.toLowerCase()))
    .map(row => row.candidateId)).size

  // While the first two replay-trained artifacts are still waiting for exact-artifact canary proof,
  // never let the evaluator consume the account's last serverless worker reservation. Production
  // 2026-09-22 hit 10/10 with one graduate and live evaluator leases, leaving the prioritized canary
  // unable to provision. This is scheduling only: no endpoint is reclaimed here and no authority expands.
  if (remediationReplayCanaryPasses < 2) {
    const capacity = await massDistilledServerlessWorkerCapacity()
    if (capacity.availableWorkers <= 1) {
      return {
        issued: false,
        reason: 'replay_canary_runpod_headroom_reserved',
        disposed: 0,
      }
    }
  }

  // The Builder apprenticeship proof lane is defined by the durable v2 receipt, not the broad historical
  // frontier profile. Old-recipe artifacts share that profile and already produced dozens of evaluation rows.
  // Count only durable results from confirmed response-anchor v2 Computer Science artifacts.
  let builderV2ProofCompletions = MASS_EVALUATION_BUILDER_V2_PROOF_SAMPLE
  try {
    const builderArtifacts = await db.from('cos_local_distillation_artifacts')
      .select('candidate_id,intended_use,created_at')
      .eq('subject_id', 'Computer Science & Coding')
      .like('candidate_id', 'mass:%')
      .order('created_at', { ascending: false })
      .limit(500)
    if (!builderArtifacts.error) {
      const builderIds = (builderArtifacts.data || [])
        .filter((row: any) => isBuilderV2Receipt(row?.intended_use))
        .map((row: any) => clean(row.candidate_id, 240))
        .filter(Boolean)
      if (builderIds.length) {
        const builderResults = await db.from('cos_university_distilled_evaluation_runs')
          .select('candidate_id')
          .in('candidate_id', builderIds)
          .limit(500)
        if (!builderResults.error) {
          builderV2ProofCompletions = new Set((builderResults.data || [])
            .map((row: any) => clean(row.candidate_id, 240)).filter(Boolean)).size
        }
      } else {
        builderV2ProofCompletions = 0
      }
    }
  } catch {
    builderV2ProofCompletions = MASS_EVALUATION_BUILDER_V2_PROOF_SAMPLE
  }

  // The post-GKD remediation replay repair also needs a bounded proof cohort. Count durable
  // independent evaluation rows from replay-proven artifacts across all statuses; once two exist,
  // scheduling automatically returns to the pre-existing Builder/frontier/oldest-first order.
  let remediationReplayProofCompletions = MASS_EVALUATION_REMEDIATION_REPLAY_PROOF_SAMPLE
  try {
    const replayProofArtifacts = await db.from('cos_local_distillation_artifacts')
      .select('candidate_id,intended_use')
      .contains('intended_use', { trainingReceipt: { failureDerivedReplayRequired: true } })
      .like('candidate_id', 'mass:%')
      .limit(500)
    if (!replayProofArtifacts.error) {
      const replayIds = (replayProofArtifacts.data || [])
        .filter((row: any) => isRemediationReplayReceipt(row?.intended_use))
        .map((row: any) => clean(row.candidate_id, 240))
        .filter(Boolean)
      if (replayIds.length) {
        const replayResults = await db.from('cos_university_distilled_evaluation_runs')
          .select('candidate_id')
          .in('candidate_id', replayIds)
          .limit(500)
        if (!replayResults.error) {
          remediationReplayProofCompletions = new Set((replayResults.data || [])
            .map((row: any) => clean(row.candidate_id, 240)).filter(Boolean)).size
        }
      } else {
        remediationReplayProofCompletions = 0
      }
    }
  } catch {
    remediationReplayProofCompletions = MASS_EVALUATION_REMEDIATION_REPLAY_PROOF_SAMPLE
  }

  // The current frontier recipe cannot improve itself until it receives independent measurements.
  // A start is not proof: Production 2026-09-20 launched four frontier reservations, but three ended in
  // RunPod readiness failures before any evaluation row existed. Count distinct durable evaluation results
  // across all frontier artifact statuses so infrastructure failures remain retryable/preferred until the
  // bounded four-result proof cohort actually exists. Failure to read this optional scheduling signal falls
  // back to normal oldest-first order rather than blocking evaluation.
  let frontierProofCompletions = MASS_EVALUATION_FRONTIER_PROOF_SAMPLE
  try {
    const frontierArtifacts = await db.from('cos_local_distillation_artifacts')
      .select('candidate_id')
      .contains('intended_use', { trainingReceipt: { profile: 'cos_university_frontier_gkd_v1' } })
      .like('candidate_id', 'mass:%')
      .limit(500)
    if (!frontierArtifacts.error) {
      const frontierIds = (frontierArtifacts.data || []).map((row: any) => clean(row.candidate_id, 240)).filter(Boolean)
      if (frontierIds.length) {
        const frontierResults = await db.from('cos_university_distilled_evaluation_runs')
          .select('candidate_id')
          .in('candidate_id', frontierIds)
          .limit(1000)
        if (!frontierResults.error) frontierProofCompletions = new Set((frontierResults.data || []).map((row: any) => clean(row.candidate_id, 240)).filter(Boolean)).size
      }
    }
  } catch {
    frontierProofCompletions = MASS_EVALUATION_FRONTIER_PROOF_SAMPLE
  }

  // Clear artifacts the approval policy has already refused permanently before choosing this tick's work, so
  // the selection window holds only artifacts that can still be evaluated.
  const exhausted = decideExhaustedMassEvaluationArtifacts({ artifacts: rows, events: all, now })
  const disposed = exhausted.length ? await disposeExhaustedArtifacts(exhausted, now) : []
  if (disposed.length) {
    console.info('[cos-mass-distilled-exhausted-disposition]', JSON.stringify({
      disposed: disposed.length,
      candidates: disposed.map(item => item.candidateId).slice(0, 20),
    }))
  }
  const remaining = disposed.length
    ? rows.filter(row => !disposed.some(item => item.candidateId === row.candidateId
      && item.artifactHash === row.artifactHash))
    : rows
  if (!remaining.length) return { issued: false, reason: 'no_mass_artifact_pending', disposed: disposed.length }
  const decision = decideRollingMassEvaluationApproval({
    enabled: process.env.COS_MASS_EVALUATION_ROLLING_AUTHORIZATION !== 'false',
    artifacts: remaining,
    events: all,
    now,
    frontierProofCompletions,
    builderV2ProofCompletions,
    remediationReplayProofCompletions,
    inFlightCount,
  })
  if ('reason' in decision) return { issued: false, reason: decision.reason, disposed: disposed.length }
  const inserted = await db.from('cos_university_learning_assurance_events').insert({
    event_key: hash(['mass-rolling-evaluation-approval', decision.artifact.candidateId, decision.artifact.artifactHash, now.toISOString()]),
    event_type: 'fine_tune',
    subject_id: decision.artifact.subjectId || null,
    candidate_id: decision.artifact.candidateId,
    evidence_hash: hash(decision.evidence),
    evidence: decision.evidence,
    verifier: 'host_controller',
    observed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + MASS_EVALUATION_APPROVAL_TTL_MS).toISOString(),
  })
  if (inserted.error) throw inserted.error
  return { issued: true, candidateId: decision.artifact.candidateId, artifactHash: decision.artifact.artifactHash, disposed: disposed.length }
}

async function claimNext(): Promise<MassEvaluationClaim | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.rpc('claim_next_mass_distilled_evaluation')
  if (result.error) throw result.error
  const row = Array.isArray(result.data) ? result.data[0] as RawClaim | undefined : undefined
  if (!row) return null

  const candidateId = clean(row.candidate_id, 240)
  const subjectId = clean(row.subject_id, 240)
  const artifactId = clean(row.artifact_id, 500)
  const artifactHash = clean(row.artifact_hash, 64).toLowerCase()
  const revisionKey = clean(row.revision_key, 64).toLowerCase()
  const datasetHash = clean(row.dataset_hash, 64).toLowerCase()
  const endpointId = clean(row.endpoint_id, 120)
  const approvalObservedAt = clean(row.approval_observed_at, 80)
  const reservationEventKey = clean(row.reservation_event_key, 64)
  const maxEndpointCalls = Number(row.max_endpoint_calls)
  const maxJudgeCalls = Number(row.max_judge_calls)
  const maxRuntimeWakeAttempts = Number(row.max_runtime_wake_attempts)
  const maxEstimatedRuntimeWakeCostUsd = Number(row.max_estimated_runtime_wake_cost_usd)

  if (!candidateId.startsWith('mass:') || !subjectId || !artifactId
    || !HEX64.test(artifactHash) || !HEX64.test(revisionKey) || !HEX64.test(datasetHash)
    || !ENDPOINT_ID.test(endpointId) || !approvalObservedAt || !HEX64.test(reservationEventKey)
    || maxEndpointCalls !== MASS_EVALUATION_ENDPOINT_CALLS || maxJudgeCalls !== 4 || maxRuntimeWakeAttempts !== 1
    || !Number.isFinite(maxEstimatedRuntimeWakeCostUsd)
    || maxEstimatedRuntimeWakeCostUsd <= 0 || maxEstimatedRuntimeWakeCostUsd > 0.2) {
    throw new Error('mass_distilled_evaluation_atomic_claim_invalid')
  }

  return Object.freeze({
    candidateId,
    subjectId,
    artifactId,
    artifactHash,
    revisionKey,
    datasetHash,
    endpointId,
    approvalObservedAt,
    maxEndpointCalls,
    maxJudgeCalls,
    maxRuntimeWakeAttempts,
    maxEstimatedRuntimeWakeCostUsd,
    reservationEventKey,
  })
}

// One bounded read, before any claim, wake or model call. The evaluator writes its verdict only at the END of
// a run, so a column that exists in the code but not yet in the database turns a complete evaluation - wake,
// inference, judge - into a lost run that also spends an artifact attempt and a rolling approval. Checking the
// write surface first makes that mistake cost one cheap select instead. It happened on 2026-09-20 with
// safety_baseline_score / safety_absolute_threshold_met and looked like model failure for hours.
async function evaluationSchemaMissingColumns(): Promise<string[] | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const probe = await db.from('cos_university_distilled_evaluation_runs')
    .select(REQUIRED_EVALUATION_RUN_COLUMNS.join(','))
    .limit(1)
  if (!probe.error) return null
  // Only an unknown column means the migration is pending. Auth, network and timeouts are real failures and
  // must keep their own error rather than being reported as a schema problem.
  if (!isMissingColumnError(probe.error)) throw probe.error
  return missingColumnsFromError(probe.error)
}

async function quarantineTerminalHoldoutDefect(claim: MassEvaluationClaim) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const updated = await db.from('cos_local_distillation_artifacts')
    .update({ status: 'quarantined', updated_at: new Date().toISOString() })
    .eq('candidate_id', claim.candidateId)
    .eq('trained_artifact_hash', claim.artifactHash)
    .eq('status', 'evaluation_pending')
  if (updated.error) throw updated.error
}

async function recordTerminal(input: {
  claim: MassEvaluationClaim
  eventClaim: typeof COMPLETED | typeof FAILED
  evidence: Record<string, unknown>
}) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const body = {
    profile: PROFILE,
    claim: input.eventClaim,
    candidateId: input.claim.candidateId,
    artifactHash: input.claim.artifactHash,
    revisionKey: input.claim.revisionKey,
    endpointId: input.claim.endpointId,
    reservationEventKey: input.claim.reservationEventKey,
    authorizationObservedAt: input.claim.approvalObservedAt,
    ...input.evidence,
    productionTrafficAuthorized: false,
    authorityExpanded: false,
  }
  const evidenceHash = hash(body)
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: hash([PROFILE, input.eventClaim, input.claim.candidateId, input.claim.artifactHash, input.claim.reservationEventKey]),
    event_type: 'fine_tune',
    subject_id: input.claim.subjectId,
    candidate_id: input.claim.candidateId,
    evidence_hash: evidenceHash,
    evidence: body,
    verifier: 'host_controller',
    observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let claim: MassEvaluationClaim | null = null
  try {
    const evaluator = await independentEvaluatorConfig()
    if (!evaluator) {
      await recordProduction(true, {
        runnerInvoked: false,
        skipped: true,
        status: 'not_claimed',
        reason: 'independent_evaluator_not_configured',
      }).catch(() => undefined)
      return NextResponse.json({ ok: true, skipped: true, reason: 'independent_evaluator_not_configured' })
    }
    if (!process.env.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET) {
      process.env.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET = evaluator.secret
    }

    let missingColumns: string[] | null
    try {
      missingColumns = await evaluationSchemaMissingColumns()
    } catch (error) {
      throw new Error(`mass_distilled_evaluation_schema_preflight_failed:${boundedErrorMessage(error)}`)
    }
    if (missingColumns) {
      await recordProduction(false, {
        runnerInvoked: false,
        blocked: 'evaluation_schema_migration_pending',
        missingColumns,
      }).catch(() => undefined)
      console.error('[cos-mass-distilled-independent-evaluation]', JSON.stringify({
        ok: false,
        error: 'evaluation_schema_migration_pending',
        missingColumns,
      }))
      return NextResponse.json({
        ok: false,
        error: 'evaluation_schema_migration_pending',
        missingColumns,
      }, { status: 503 })
    }

    let account: Awaited<ReturnType<typeof queryRunpodAccountStatus>>
    try {
      account = await queryRunpodAccountStatus()
    } catch (error) {
      throw new Error(`mass_distilled_evaluation_runpod_account_preflight_failed:${boundedErrorMessage(error)}`)
    }
    if (account.clientBalance !== null && account.clientBalance < MIN_BALANCE_USD) {
      await recordProduction(false, {
        runnerInvoked: false,
        blocked: 'runpod_balance_guard',
        balance: account.clientBalance,
      }).catch(() => undefined)
      return NextResponse.json({ ok: false, error: 'runpod_balance_guard', balance: account.clientBalance }, { status: 402 })
    }

    let rolling: RollingOutcome
    try {
      rolling = await ensureRollingMassEvaluationApproval()
    } catch (error) {
      throw new Error(`mass_distilled_evaluation_rolling_preflight_failed:${boundedErrorMessage(error)}`)
    }
    console.info('[cos-mass-distilled-rolling-authorization]', JSON.stringify(rolling))
    // A previous tick may already have issued a bounded approval that has not yet been atomically
    // claimed. Draining that approval does not mint new authority or expand spend: claimNext() re-validates
    // the exact unexpired approval, canary, artifact identity, 18-call ceiling, 4 judge calls, 1 wake and
    // <= $0.20 wake budget under the database advisory lock.
    //
    // Only the two queue-state reasons below may fall through to the existing-approval claim path:
    // - no_mass_artifact_eligible_for_rolling_evaluation: commonly means every eligible artifact is already armed;
    // - rolling_mass_evaluation_window_exhausted: no NEW approval may be issued, but already-issued approvals
    //   inside that same window must still be allowed to execute.
    //
    // The authorization kill switch, no-pending-work state and any future/unknown denial remain fail-closed.
    const mayDrainExistingApproval = !rolling.issued
      && (rolling.reason === 'no_mass_artifact_eligible_for_rolling_evaluation'
        || rolling.reason === 'rolling_mass_evaluation_window_exhausted')
    if (!rolling.issued && !mayDrainExistingApproval) {
      await recordProduction(true, {
        runnerInvoked: false,
        skipped: true,
        status: 'not_claimed',
        reason: rolling.reason,
      }).catch(() => undefined)
      return NextResponse.json({ ok: true, skipped: true, reason: rolling.reason })
    }
    claim = await claimNext()
    if (!claim) {
      await recordProduction(true, {
        runnerInvoked: false,
        skipped: true,
        status: 'not_claimed',
        reason: 'no_atomically_claimable_mass_distilled_evaluation',
      }).catch(() => undefined)
      return NextResponse.json({ ok: true, skipped: true, reason: 'no_atomically_claimable_mass_distilled_evaluation' })
    }

    // The evaluator must not depend on a separate canary cron having already applied the current GPU policy.
    // Re-assert the exact endpoint's existing scale-to-zero/one-worker safety envelope and narrow its provider
    // GPU pool to AMPERE_24 before waking or any score-generating model request.
    const runtimePolicy = await ensureMassDistilledEndpoint24Gb(claim.endpointId)
    console.info('[cos-mass-distilled-runtime-preflight]', JSON.stringify(runtimePolicy))

    const deadlineMs = Date.now() + ROUTE_BUDGET_MS
    // `/ready` is a worker-local probe. When the serverless endpoint has scaled fully to zero, repeatedly
    // polling it can produce network-only failures without ever creating a worker. Wake through the actual
    // load-balancer path first, using a route the exact-artifact gateway actually serves; `/ping` generates no
    // tokens and does not consume one of the
    // approved scoring calls. It does, however, realize the already-approved single runtime wake attempt.
    const runtimeWake = await wakeMassDistilledRuntime(claim.endpointId, deadlineMs)
    console.info('[cos-mass-distilled-runtime-wake]', JSON.stringify(runtimeWake))

    const result = await runMassDistilledArtifactEvaluation({ claim, deadlineMs, now: new Date() })
    await recordTerminal({
      claim,
      eventClaim: COMPLETED,
      evidence: {
        evaluationPassed: result.evaluationPassed,
        nextStatus: result.nextStatus,
        evaluatorId: result.evaluatorId,
        model: result.model,
        endpointCalls: result.endpointCalls,
        judgeCalls: result.judgeCalls,
        holdout: result.holdout,
        safety: result.safety,
        transfer: result.transfer,
        retention: result.retention,
      },
    })
    await recordProduction(true, {
      runnerInvoked: true,
      attempted: 1,
      status: 'completed',
      candidateId: claim.candidateId,
      artifactHash: claim.artifactHash,
      evaluationPassed: result.evaluationPassed,
      nextStatus: result.nextStatus,
      endpointCalls: result.endpointCalls,
      judgeCalls: result.judgeCalls,
    }).catch(() => undefined)
    console.info('[cos-mass-distilled-independent-evaluation]', JSON.stringify(result))
    return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    const message = boundedErrorMessage(error)
    // A defect in our own code (2026-09-17 20:01 UTC: "Cannot read properties of undefined (reading 'length')")
    // is indistinguishable from a provider failure without the throw site. Record the first frames of our own
    // stack, and nothing else from the error: no provider bodies, prompts, answers or credentials.
    const frames = error instanceof Error
      ? String(error.stack || '').split('\n').filter(line => line.trim().startsWith('at ')).slice(0, 4)
        .map(line => clean(line.replace(/^\s*at\s+/, ''), 160)).filter(Boolean)
      : []
    // A holdout is pinned to an immutable commit, so a failure that is a property of that frozen data can
    // never succeed on a later attempt: every retry re-reads the same bytes, spends another RunPod wake and
    // reaches the same verdict. Only the malformed-format case was recognised here; the rest of that family
    // now ends the same way instead of circling on the retry ladder. Availability failures and reader
    // ceilings are deliberately excluded and stay retryable - see the predicate for why.
    const terminalDataDefect = isTerminalHoldoutDataDefect(message)
    const workerQuotaDeferred = Boolean(claim)
      && message.toLowerCase().includes('max workers across all endpoints must not exceed your workers quota')
    if (claim) {
      if (terminalDataDefect) {
        await quarantineTerminalHoldoutDefect(claim).catch(() => undefined)
      }
      await recordTerminal({
        claim,
        eventClaim: FAILED,
        evidence: {
          error: clean(message, 500),
          ...(terminalDataDefect ? { terminalDataDefect: true, nextStatus: 'quarantined' } : {}),
          ...(frames.length ? { errorFrames: frames } : {}),
        },
      }).catch(() => undefined)
    }
    await recordProduction(false, {
      runnerInvoked: Boolean(claim),
      error: clean(message, 500),
      ...(workerQuotaDeferred ? { infrastructureDeferred: true, reason: 'runpod_worker_quota_full' } : {}),
      ...(frames.length ? { errorFrames: frames } : {}),
      ...(claim ? { candidateId: claim.candidateId, artifactHash: claim.artifactHash } : {}),
    }).catch(() => undefined)
    if (workerQuotaDeferred) {
      console.info('[cos-mass-distilled-independent-evaluation]', JSON.stringify({
        ok: true,
        skipped: true,
        reason: 'runpod_worker_quota_full',
        retryable: true,
      }))
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'runpod_worker_quota_full',
        retryable: true,
      }, { status: 200 })
    }
    console.error('[cos-mass-distilled-independent-evaluation]', JSON.stringify({ ok: false, error: clean(message, 500) }))
    if (claim && terminalDataDefect) {
      return NextResponse.json({
        ok: false,
        quarantined: true,
        error: clean(message, 500),
        nextStatus: 'quarantined',
      }, { status: 200 })
    }
    return NextResponse.json({ ok: false, error: clean(message, 500) }, { status: 500 })
  }
}
