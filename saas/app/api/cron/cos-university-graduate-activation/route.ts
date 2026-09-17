// saas/app/api/cron/cos-university-graduate-activation/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { activateGraduateRuntime } from '@/lib/ai/cos/cosUniversityGraduateRuntime'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { DISTILLED_MODEL_NAME } from '@/lib/ai/cos/runpodServerlessDistilledProvision'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { registerPromotedGraduateModel } from '@/lib/ai/cos/cosUniversityGraduateModelRegistry'
import { decideMassGraduateRegistration, type MassGraduateEvent } from '@/lib/ai/cos/cosUniversityMassGraduateRegistration'

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

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Registration is a durable record, not a runtime: it writes one pending_runtime row and spends nothing, so it
    // runs before the activation flag. Activation itself stays behind that flag and its own evidence gates.
    const massRegistration = await registerNextMassGraduate()

    if (String(process.env[ACTIVATION_ENABLED_FLAG] || '').trim() !== 'true') {
      return NextResponse.json({ ok: true, skipped: true, reason: 'graduate_activation_disabled', massRegistration })
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
      return NextResponse.json({ ok: true, skipped: true, reason: 'no_pending_runtime_graduate', massRegistration })
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

    const result = await activateGraduateRuntime({
      candidateId: String(graduate.candidate_id || ''),
      trainedArtifactHash: String(graduate.trained_artifact_hash || ''),
      // The served identity is the LoRA's serving name on the runtime, not the artifact repo id:
      // the /models identity check compares against what the endpoint actually lists.
      runtimeModelId: DISTILLED_MODEL_NAME,
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
