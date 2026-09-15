// saas/app/api/cron/cos-university-graduate-activation/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { activateGraduateRuntime } from '@/lib/ai/cos/cosUniversityGraduateRuntime'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { DISTILLED_MODEL_NAME } from '@/lib/ai/cos/runpodServerlessDistilledProvision'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    if (String(process.env[ACTIVATION_ENABLED_FLAG] || '').trim() !== 'true') {
      return NextResponse.json({ ok: true, skipped: true, reason: 'graduate_activation_disabled' })
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
      return NextResponse.json({ ok: true, skipped: true, reason: 'no_pending_runtime_graduate' })
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
