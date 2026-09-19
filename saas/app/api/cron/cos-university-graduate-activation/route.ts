// saas/app/api/cron/cos-university-graduate-activation/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { activateGraduateRuntime } from '@/lib/ai/cos/cosUniversityGraduateRuntime'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { servedCandidateModelFromCanary, type CanaryEventRow } from '@/lib/ai/cos/cosUniversityMassEvaluationServedModel'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { registerPromotedGraduateModel } from '@/lib/ai/cos/cosUniversityGraduateModelRegistry'
import { decideMassGraduateRegistration, type MassGraduateEvent } from '@/lib/ai/cos/cosUniversityMassGraduateRegistration'
import { GRADUATE_ROLLBACK_PROOF_CLAIM, GRADUATE_ROLLBACK_PROOF_PROFILE, proveGraduateRollbackReference } from '@/lib/ai/cos/cosUniversityGraduateRollbackProof'
import { createHash } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// A scale-to-zero graduate runtime needs minutes to prove readiness from cold; the identity wait
// (GRADUATE_RUNTIME_READY_WAIT_MS = 240s) must fit inside this ceiling with room to record evidence.
export const maxDuration = 300

/**
 * The missing caller: promotion writes graduates as `pending_runtime`, COS routing already consumes
 * `active` graduates, and nothing in between ever invoked activateGraduateRuntime — a promoted
 * graduate would sit pending forever. This cron binds the newest pending graduate to the
 * operator-configured serving profile. All hard gates (promotion evidence, rollback, authority,
 * live health, exact served-model identity) live inside activateGraduateRuntime itself; this route
 * only feeds it and records the outcome, activation is idempotent per registry row, and the
 * owner switch is the environment flag below — fail-closed when absent.
 */
const ACTIVATION_ENABLED_FLAG = 'COS_GRADUATE_ACTIVATION_ENABLED'


const RUNPOD_SERVERLESS_HOST = /^([a-z0-9]+)\.api\.runpod\.ai$/i

function configuredGraduateRunpodEndpointId(): string | null {
  const raw = String(process.env.COS_GRADUATE_AI_BASE_URL || '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    const match = RUNPOD_SERVERLESS_HOST.exec(url.hostname)
    if (!match || url.protocol !== 'https:' || !/^\/v1\/?$/.test(url.pathname)) return null
    return match[1].toLowerCase()
  } catch {
    return null
  }
}

/**
 * Bind activation to the exact mass-artifact serving identity already proven by its canary.
 * The configured graduate endpoint must itself be that canary endpoint; activation never guesses
 * a model name, provisions an endpoint, restores RunPod capacity, or mutates provider state.
 */
async function resolvePendingGraduateServingIdentity(db: any, graduate: {
  candidate_id: unknown
  trained_artifact_hash: unknown
}): Promise<{ endpointId: string; modelId: string }> {
  const endpointId = configuredGraduateRunpodEndpointId()
  if (!endpointId) throw new Error('graduate_runtime_exact_runpod_endpoint_not_configured')

  const candidateId = String(graduate.candidate_id || '').trim()
  const artifactHash = String(graduate.trained_artifact_hash || '').trim().toLowerCase()
  if (!candidateId || !/^[a-f0-9]{64}$/.test(artifactHash)) throw new Error('graduate_runtime_identity_invalid')

  const canaries = await db.from('cos_university_learning_assurance_events')
    .select('verifier,evidence,observed_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .eq('verifier', 'host_controller')
    .contains('evidence', { claim: 'local_distilled_runtime_canary_passed', exactArtifact: true, endpointId })
    .order('observed_at', { ascending: false })
    .limit(100)
  if (canaries.error) throw canaries.error

  const modelId = servedCandidateModelFromCanary((canaries.data || []) as CanaryEventRow[], {
    candidateId,
    artifactHash,
    endpointId,
  })
  return { endpointId, modelId }
}

/**
 * Initial capability scope per subject, deliberately narrow: the reasoning graduate advises as
 * critic/verifier inside the worker mesh; it does not take over primary reasoning by being
 * activated. Scope widening is a separate, explicit owner decision — never a side effect here.
 */
const SUBJECT_WORKER_SCOPE: Record<string, { workerRoles: string[]; problemClasses: string[] }> = {
  reasoning_decision_science: {
    workerRoles: ['critic', 'verifier'],
    problemClasses: ['reasoning_decision_science'],
  },
}

/** Writes the graduate registry row for the oldest mass artifact whose recorded evidence clears every gate. */
async function registerNextMassGraduate() {
  const db = cosServiceDb()
  if (!db) return { registered: false as const, reason: 'service_database_unavailable' }
  const artifacts = await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,subject_id,student_model_id,trained_artifact_id,trained_artifact_hash,rollback_artifact_ref,status,created_at')
    .eq('status', 'runtime_pending')
    .like('candidate_id', 'mass:%')
    .order('created_at', { ascending: true })
    .limit(50)
  if (artifacts.error) throw artifacts.error
  const candidateIds = (artifacts.data || []).map((row: any) => String(row.candidate_id))
  if (!candidateIds.length) return { registered: false as const, reason: 'no_runtime_pending_mass_artifact' }

  const tracked = await db.from('cos_university_graduate_model_registry').select('candidate_id,trained_artifact_hash').in('candidate_id', candidateIds).limit(200)
  if (tracked.error) throw tracked.error
  const already = new Set((tracked.data || []).map((row: any) => `${row.candidate_id}:${String(row.trained_artifact_hash).toLowerCase()}`))

  const events = await db.from('cos_university_learning_assurance_events')
    .select('candidate_id,verifier,evidence')
    .eq('event_type', 'fine_tune')
    .in('candidate_id', candidateIds)
    .order('observed_at', { ascending: false })
    .limit(3000)
  if (events.error) throw events.error

  const decision = decideMassGraduateRegistration({
    enabled: String(process.env.COS_MASS_GRADUATE_REGISTRATION || '').trim() !== 'false',
    artifacts: (artifacts.data || [])
      .filter((row: any) => !already.has(`${row.candidate_id}:${String(row.trained_artifact_hash).toLowerCase()}`))
      .map((row: any) => ({
        candidateId: String(row.candidate_id), subjectId: String(row.subject_id || ''), studentModelId: String(row.student_model_id || ''),
        trainedArtifactId: String(row.trained_artifact_id || ''), trainedArtifactHash: String(row.trained_artifact_hash || ''),
        rollbackArtifactRef: row.rollback_artifact_ref ? String(row.rollback_artifact_ref) : null,
        status: String(row.status || ''), createdAt: String(row.created_at || ''),
      })),
    events: (events.data || []).map((row: any): MassGraduateEvent => ({
      candidateId: String(row.candidate_id), verifier: String(row.verifier || ''),
      evidence: row.evidence && typeof row.evidence === 'object' ? row.evidence : null,
    })),
  })
  if (!('artifact' in decision)) return { registered: false as const, reason: decision.reason }

  const registration = await registerPromotedGraduateModel({
    candidateId: decision.artifact.candidateId,
    subjectId: decision.artifact.subjectId,
    studentModelId: decision.artifact.studentModelId,
    trainedArtifactId: decision.artifact.trainedArtifactId,
    trainedArtifactHash: decision.artifact.trainedArtifactHash,
    rollbackArtifactRef: decision.artifact.rollbackArtifactRef,
    eligibleForPromotion: true,
    authorityExpanded: false,
    promotedAt: new Date(),
  })
  return {
    registered: registration.tracked === true,
    candidateId: decision.artifact.candidateId,
    artifactHash: decision.artifact.trainedArtifactHash,
    baselineScore: decision.baselineScore,
    trainedArtifactScore: decision.trainedArtifactScore,
    status: registration.status,
    blockers: registration.blockers,
    productionTrafficAuthorized: false,
  }
}

/**
 * Resolves the rollback target of the oldest pending graduate that has not been proven yet and records the result.
 * Read-only: it proves the reference exists, it does not perform a rollback and it changes no graduate status.
 */
async function proveNextGraduateRollback() {
  const db = cosServiceDb()
  if (!db) return { proven: false as const, reason: 'service_database_unavailable' }
  const graduates = await db.from('cos_university_graduate_model_registry')
    .select('candidate_id,subject_id,trained_artifact_hash,rollback_artifact_ref')
    .in('status', ['pending_runtime', 'canary', 'active'])
    .order('created_at', { ascending: true })
    .limit(50)
  if (graduates.error) throw graduates.error
  const rows = graduates.data || []
  if (!rows.length) return { proven: false as const, reason: 'no_registered_graduate' }

  const proven = await db.from('cos_university_learning_assurance_events')
    .select('candidate_id,evidence')
    .eq('event_type', 'fine_tune')
    .in('candidate_id', rows.map((row: any) => String(row.candidate_id)))
    .contains('evidence', { claim: GRADUATE_ROLLBACK_PROOF_CLAIM })
    .limit(200)
  if (proven.error) throw proven.error
  const done = new Set((proven.data || [])
    .filter((row: any) => row.evidence?.ok === true)
    .map((row: any) => `${row.candidate_id}:${String(row.evidence?.artifactHash || '').toLowerCase()}`))

  const next = rows.find((row: any) => !done.has(`${row.candidate_id}:${String(row.trained_artifact_hash).toLowerCase()}`))
  if (!next) return { proven: false as const, reason: 'every_graduate_rollback_already_proven' }

  const proof = await proveGraduateRollbackReference({ rollbackArtifactRef: next.rollback_artifact_ref })
  const evidence = {
    profile: GRADUATE_ROLLBACK_PROOF_PROFILE,
    claim: GRADUATE_ROLLBACK_PROOF_CLAIM,
    candidateId: String(next.candidate_id),
    artifactHash: String(next.trained_artifact_hash).toLowerCase(),
    ...proof,
    rollbackPerformed: false,
    productionTrafficAuthorized: false,
    authorityExpanded: false,
  }
  const evidenceHash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  const recorded = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: createHash('sha256').update(JSON.stringify([GRADUATE_ROLLBACK_PROOF_PROFILE, next.candidate_id, evidence.artifactHash, evidenceHash])).digest('hex'),
    event_type: 'fine_tune',
    subject_id: String(next.subject_id || ''),
    candidate_id: String(next.candidate_id),
    evidence_hash: evidenceHash,
    evidence,
    verifier: 'host_production_verifier',
    observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (recorded.error) throw recorded.error
  return { proven: proof.ok, candidateId: String(next.candidate_id), reason: proof.reason, resolvedRevision: proof.resolvedRevision, rollbackPerformed: false }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Registration is a durable record, not a runtime: it writes one pending_runtime row and spends nothing, so it
    // runs before the activation flag. Activation itself stays behind that flag and its own evidence gates.
    const massRegistration = await registerNextMassGraduate()
    const rollbackProof = await proveNextGraduateRollback()

    if (String(process.env[ACTIVATION_ENABLED_FLAG] || '').trim() !== 'true') {
      return NextResponse.json({ ok: true, skipped: true, reason: 'graduate_activation_disabled', massRegistration, rollbackProof })
    }

    const db = cosServiceDb()
    if (!db) throw new Error('service_database_unavailable')

    const pending = await db.from('cos_university_graduate_model_registry')
      .select('candidate_id,subject_id,trained_artifact_hash,status')
      .eq('status', 'pending_runtime')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (pending.error) throw pending.error
    if (!pending.data) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'no_pending_runtime_graduate', massRegistration, rollbackProof })
    }

    const graduate: any = pending.data
    const scope = SUBJECT_WORKER_SCOPE[String(graduate.subject_id || '')]
    if (!scope) {
      // A subject without a declared scope is a decision, not a default. Record and stop.
      await recordCosUniversityProductionPath({
        path: 'graduate_runtime_activation',
        invocationSucceeded: false,
        evidence: { error: 'graduate_subject_scope_undeclared', subjectId: graduate.subject_id },
      })
      return NextResponse.json({ ok: false, error: 'graduate_subject_scope_undeclared', subjectId: graduate.subject_id }, { status: 422 })
    }

    const serving = await resolvePendingGraduateServingIdentity(db, graduate)
    const result = await activateGraduateRuntime({
      candidateId: String(graduate.candidate_id || ''),
      trainedArtifactHash: String(graduate.trained_artifact_hash || ''),
      // The exact served identity comes from this artifact's passing host canary on the same
      // configured RunPod endpoint; never infer it from an artifact hash or a static legacy name.
      runtimeModelId: serving.modelId,
      runtimeProfile: 'graduate_ai',
      workerRoles: scope.workerRoles as never,
      problemClasses: scope.problemClasses,
      now: new Date(),
    })

    await recordCosUniversityProductionPath({
      path: 'graduate_runtime_activation',
      invocationSucceeded: true,
      evidence: {
        candidateId: graduate.candidate_id,
        subjectId: graduate.subject_id,
        activated: result.activated,
        blockers: result.blockers,
        servingEndpointId: serving.endpointId,
        servingModelId: serving.modelId,
        ...(result.activated ? {
          provider: (result as any).provider,
          healthEvidenceHash: (result as any).healthEvidenceHash,
          activationEvidenceHash: (result as any).activationEvidenceHash,
        } : {}),
      },
    })

    return NextResponse.json({ ok: true, activated: result.activated, blockers: result.blockers })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordCosUniversityProductionPath({
      path: 'graduate_runtime_activation',
      invocationSucceeded: false,
      evidence: { error: message },
    }).catch(() => null)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
