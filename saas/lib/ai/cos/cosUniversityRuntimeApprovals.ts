// saas/lib/ai/cos/cosUniversityRuntimeApprovals.ts
import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { DISTILLED_ADAPTER_MODEL_ID } from '@/lib/ai/cos/runpodServerlessDistilledProvision'
import { FINE_TUNE_EVIDENCE_PROFILE } from '@/lib/ai/cos/cosUniversityFineTuneEvidence'
import {
  DISTILLED_EVALUATION_APPROVAL_CLAIM,
  DISTILLED_EVALUATION_APPROVAL_PROFILE,
  DISTILLED_EVALUATION_APPROVAL_TTL_MS,
  DISTILLED_EVALUATION_ATTEMPT_CLAIM,
  DISTILLED_EVALUATION_PATH_ID,
  DISTILLED_EVALUATION_RETENTION_DELAY_MS,
  DISTILLED_EVALUATOR_VERSION,
  approvalState,
  buildDistilledEvaluationApproval,
  completedIndependentEvaluation,
  delayedRetentionRecovery,
  distilledEvaluationCallCeilings,
  isDistilledEvaluationApprovalEvidence,
  tickClearance,
  type ApprovalRow,
} from '@/lib/ai/cos/cosUniversityRuntimeApprovalPolicy'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const HEX64 = /^[a-f0-9]{64}$/

function db() {
  const client = cosServiceDb()
  if (!client) throw new Error('service_database_unavailable')
  return client
}

/** Same artifact selection as the evaluator's runtime claim, so the approval targets what it will run. */
async function pendingArtifact() {
  const result = await db().from('cos_local_distillation_artifacts')
    .select('candidate_id,subject_id,trained_artifact_hash,revision_key,created_at')
    .eq('status', 'evaluation_pending')
    .eq('trained_artifact_id', DISTILLED_ADAPTER_MODEL_ID)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data) return null
  const row: any = result.data
  const candidateId = String(row.candidate_id || '').trim()
  const subjectId = String(row.subject_id || '').trim()
  const artifactHash = String(row.trained_artifact_hash || '').trim().toLowerCase()
  const revisionKey = String(row.revision_key || '').trim().toLowerCase()
  if (!candidateId || !HEX64.test(artifactHash) || !HEX64.test(revisionKey)) {
    throw new Error('runtime_approval_artifact_identity_invalid')
  }

  // The approval ceiling is derived from the exact partition manifest bound to this artifact's
  // revision. Never guess from a default or silently discard malformed hashes: that could issue an
  // approval whose apparent ceiling differs from the evaluator's real work.
  const events = await db().from('cos_university_learning_assurance_events')
    .select('evidence,verifier,observed_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .eq('verifier', 'training_executor')
    .order('observed_at', { ascending: false })
    .limit(300)
  if (events.error) throw events.error
  const partition = (events.data || []).find((event: any) => {
    const evidence = event?.evidence
    return evidence?.profile === FINE_TUNE_EVIDENCE_PROFILE
      && evidence?.claim === 'partition_manifests_registered'
      && String(evidence?.revisionKey || '').trim().toLowerCase() === revisionKey
  }) as any
  const trained = (events.data || []).find((event: any) => {
    const evidence = event?.evidence
    return evidence?.profile === FINE_TUNE_EVIDENCE_PROFILE
      && evidence?.claim === 'trained_artifact_registered'
      && String(evidence?.artifactHash || '').trim().toLowerCase() === artifactHash
      && String(evidence?.revisionKey || '').trim().toLowerCase() === revisionKey
  }) as any
  const trainedAt = Date.parse(String(trained?.observed_at || ''))
  if (!Number.isFinite(trainedAt)) throw new Error('runtime_approval_training_time_invalid')
  const holdoutItemHashes = partition?.evidence?.holdoutItemHashes
  if (!Array.isArray(holdoutItemHashes)
    || !holdoutItemHashes.every((value: unknown) => HEX64.test(String(value || '').trim().toLowerCase()))) {
    throw new Error('runtime_approval_holdout_manifest_invalid')
  }
  const normalizedHashes = holdoutItemHashes.map((value: unknown) => String(value).trim().toLowerCase())
  if (new Set(normalizedHashes).size !== normalizedHashes.length) {
    throw new Error('runtime_approval_holdout_manifest_invalid')
  }
  const calls = distilledEvaluationCallCeilings(normalizedHashes.length)
  return {
    candidateId,
    subjectId,
    artifactHash,
    revisionKey,
    retentionReadyAt: new Date(trainedAt + DISTILLED_EVALUATION_RETENTION_DELAY_MS).toISOString(),
    ...calls,
  }
}

async function latestApproval(candidateId: string, artifactHash: string, holdoutCaseCount: number): Promise<ApprovalRow | null> {
  const rows = await db().from('cos_university_learning_assurance_events')
    .select('observed_at,expires_at,evidence')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .eq('verifier', 'host_controller')
    .order('observed_at', { ascending: false })
    .limit(100)
  if (rows.error) throw rows.error
  const match = (rows.data || []).find((row: any) => isDistilledEvaluationApprovalEvidence(
    row?.evidence,
    { candidateId, artifactHash, holdoutCaseCount },
  ))
  return (match as ApprovalRow | undefined) || null
}

async function attemptsFor(candidateId: string) {
  const rows = await db().from('cos_university_learning_assurance_events')
    .select('evidence')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .eq('verifier', 'host_controller')
    .order('observed_at', { ascending: false })
    .limit(200)
  if (rows.error) throw rows.error
  return ((rows.data || []) as Array<{ evidence: Record<string, unknown> | null }>)
    .filter(row => row?.evidence?.claim === DISTILLED_EVALUATION_ATTEMPT_CLAIM)
}

async function latestOutcome(sinceIso: string | null) {
  let query = db().from('cos_university_learning_assurance_events')
    .select('observed_at,commit_sha,evidence')
    .eq('event_type', 'production_path')
    .eq('path_id', DISTILLED_EVALUATION_PATH_ID)
    .order('observed_at', { ascending: false })
    .limit(20)
  if (sinceIso) query = query.gt('observed_at', sinceIso)
  const rows = await query
  if (rows.error) throw rows.error
  const real = (rows.data || []).find((row: any) => {
    const evidence = row?.evidence || {}
    if (evidence.runnerInvoked !== true) return false
    const authorizationObservedAt = String(evidence.runtimeAttemptAuthorizationObservedAt || '')
    return !authorizationObservedAt
      || Date.parse(authorizationObservedAt) === Date.parse(String(sinceIso || ''))
  }) as any
  if (!real) return null
  return {
    observedAt: String(real.observed_at || ''),
    commit: String(real.commit_sha || '').slice(0, 9),
    succeeded: real?.evidence?.invocationSucceeded === true,
    reason: String(real?.evidence?.reason || '') || null,
    error: String(real?.evidence?.error || '').slice(0, 300) || null,
  }
}

async function independentEvaluationFor(candidateId: string, artifactHash: string) {
  const rows = await db().from('cos_university_learning_assurance_events')
    .select('observed_at,evidence')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .eq('verifier', 'independent_scorer')
    .order('observed_at', { ascending: false })
    .limit(50)
  if (rows.error) throw rows.error
  return completedIndependentEvaluation((rows.data || []) as any[], artifactHash)
}

async function delayedRetentionFor(candidateId: string, artifactHash: string, revisionKey: string, now: Date) {
  const row = await db().from('cos_university_distilled_evaluation_runs')
    .select('artifact_age_seconds,delayed_retention_passed,created_at')
    .eq('candidate_id', candidateId)
    .eq('trained_artifact_hash', artifactHash)
    .eq('revision_key', revisionKey)
    .eq('evaluator_version', DISTILLED_EVALUATOR_VERSION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (row.error) throw row.error
  return delayedRetentionRecovery((row.data as any) || null, now)
}

export async function readDistilledEvaluationApprovalStatus(now = new Date()) {
  const artifact = await pendingArtifact()
  if (!artifact) return { ok: true as const, artifact: null, state: 'none' as const, approval: null, outcome: null, evaluation: null, clearance: tickClearance(now) }
  const approval = await latestApproval(artifact.candidateId, artifact.artifactHash, artifact.holdoutCaseCount)
  const attempts = await attemptsFor(artifact.candidateId)
  const evaluation = await independentEvaluationFor(artifact.candidateId, artifact.artifactHash)
  const retentionRecovery = await delayedRetentionFor(artifact.candidateId, artifact.artifactHash, artifact.revisionKey, now)
  const approvalLifecycle = approvalState({ approval, attempts, now })
  const state = evaluation && !retentionRecovery && approvalLifecycle !== 'armed' ? 'evaluated' as const : approvalLifecycle
  const outcome = approvalLifecycle === 'consumed' && approval ? await latestOutcome(approval.observed_at) : null
  return {
    ok: true as const,
    artifact,
    state,
    approval: approval ? { observedAt: approval.observed_at, expiresAt: approval.expires_at } : null,
    outcome,
    evaluation,
    retentionRecovery,
    clearance: tickClearance(now),
  }
}

export async function issueDistilledEvaluationApproval(input: { ownerUserId: string | null; now?: Date }) {
  const now = input.now || new Date()
  const artifact = await pendingArtifact()
  if (!artifact) return { ok: false as const, error: 'no_supported_evaluation_pending_artifact' }

  const retentionWaitSeconds = Math.max(0, Math.ceil((Date.parse(artifact.retentionReadyAt) - now.getTime()) / 1000))
  if (retentionWaitSeconds > 0) {
    return {
      ok: false as const,
      error: 'delayed_retention_not_due',
      retryAfterSeconds: retentionWaitSeconds,
      readyAt: artifact.retentionReadyAt,
    }
  }

  const evaluation = await independentEvaluationFor(artifact.candidateId, artifact.artifactHash)
  const retentionRecovery = await delayedRetentionFor(artifact.candidateId, artifact.artifactHash, artifact.revisionKey, now)
  if (evaluation && !retentionRecovery) return { ok: false as const, error: 'artifact_already_independently_evaluated', evaluation }
  if (retentionRecovery && !retentionRecovery.ready) {
    return {
      ok: false as const,
      error: 'delayed_retention_not_due',
      retryAfterSeconds: retentionRecovery.retryAfterSeconds,
      readyAt: retentionRecovery.readyAt,
    }
  }

  const existing = await latestApproval(artifact.candidateId, artifact.artifactHash, artifact.holdoutCaseCount)
  const state = approvalState({ approval: existing, attempts: await attemptsFor(artifact.candidateId), now })
  if (state === 'armed') return { ok: false as const, error: 'approval_already_armed', approval: existing }

  const clearance = tickClearance(now)
  if (!clearance.ok) return { ok: false as const, error: 'too_close_to_evaluator_tick', retryAfterSeconds: clearance.retryAfterSeconds }

  const evidence = { ...buildDistilledEvaluationApproval(artifact), ownerUserId: input.ownerUserId }
  const observedAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + DISTILLED_EVALUATION_APPROVAL_TTL_MS).toISOString()
  const eventKey = hash([
    DISTILLED_EVALUATION_APPROVAL_PROFILE,
    DISTILLED_EVALUATION_APPROVAL_CLAIM,
    artifact.candidateId,
    artifact.artifactHash,
    artifact.holdoutCaseCount,
    observedAt,
  ])

  const inserted = await db().from('cos_university_learning_assurance_events').insert({
    event_key: eventKey,
    event_type: 'fine_tune',
    subject_id: artifact.subjectId || null,
    candidate_id: artifact.candidateId,
    evidence_hash: hash(evidence),
    evidence,
    verifier: 'host_controller',
    observed_at: observedAt,
    expires_at: expiresAt,
  })
  if (inserted.error) throw inserted.error

  // Never report success from the write alone: the approval exists only if it reads back.
  const readBack = await db().from('cos_university_learning_assurance_events')
    .select('observed_at,expires_at,evidence')
    .eq('event_key', eventKey)
    .maybeSingle()
  if (readBack.error) throw readBack.error
  if (!readBack.data) return { ok: false as const, error: 'approval_not_persisted' }

  return {
    ok: true as const,
    candidateId: artifact.candidateId,
    artifactHash: artifact.artifactHash,
    observedAt: String((readBack.data as any).observed_at),
    expiresAt: String((readBack.data as any).expires_at),
    nextTickAt: clearance.nextTickAt,
  }
}
