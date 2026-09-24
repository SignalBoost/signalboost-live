import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import {
  BUILDER_RESIDENCY_NATIVE_CAPABILITIES,
  createBuilderResidencyNativeAuthority,
  createLiveBuilderResidencyExecutor,
} from '@/platform-harness/residency/live-builder-executor'
import { runBuilderResidencyOrchestrator } from '@/platform-harness/residency/orchestrator'
import { admitNextBuilderResidency } from '@/platform-harness/residency/admission-store'
import { createSupabaseBuilderResidencyOrchestratorStore } from '@/platform-harness/residency/orchestrator-store'
import { createSupervisorAuditHarnessEvidenceSink } from '@/platform-harness/evidence/supervisor-audit-sink'
import { actuateBuilderResidencyRuntimeRecovery } from '@/self-healing-host/builder-residency-runtime-recovery'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 600

const RESIDENCY_TENANT = 'itmounts-university'
const RESIDENCY_PORTABLE = 'builder-residency'
const RESIDENCY_AGENT = 'builder-resident'
const RESIDENCY_SANDBOX = 'builder-residency-sandbox-v1'

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(
    secret &&
    req.headers.get('authorization') === `Bearer ${secret}`
  )
}

function enabled(): boolean {
  return process.env.COS_UNIVERSITY_RESIDENCY_ENABLED === 'true'
}

async function recordResidencyProductionPath(
  invocationSucceeded: boolean,
  evidence: Record<string, unknown>,
) {
  try {
    await recordCosUniversityProductionPath({
      path: 'builder_residency',
      invocationSucceeded,
      evidence,
    })
  } catch (error) {
    console.error(
      'cron COS University Residency assurance receipt failed:',
      error instanceof Error ? error.message : String(error),
    )
  }
}

function publicResult(result: any, admission?: any) {
  return {
    ok: result.ok,
    state: result.state,
    ...(result.residencyId ? { residencyId: result.residencyId } : {}),
    coverage: result.coverage,
    automaticFinalGateEnable: false,
    promotionAuthorized: false,
    productionTrafficAuthorized: false,
    ...(result.assessment ? {
      standing: result.assessment.standing,
      residencyComplete: result.assessment.residencyComplete,
      remediationCompetencies: result.assessment.remediationCompetencies,
    } : {}),
    ...(result.practiceCase ? { practiceCase: result.practiceCase } : {}),
    ...(result.selfHealing ? {
      selfHealing: {
        attempted: result.selfHealing.attempted === true,
        completed: result.selfHealing.completed === true,
        failureCode: result.selfHealing.failureCode,
        message: result.selfHealing.message,
        authorityExpanded: false,
        productionTrafficAuthorized: false,
      },
    } : {}),
    ...(admission ? {
      admission: {
        ok: admission.ok,
        admitted: admission.admitted === true,
        ...(admission.residencyId ? { residencyId: admission.residencyId } : {}),
        ...(admission.reason ? { reason: admission.reason } : {}),
        activeResidents: admission.activeResidents,
        activeLimit: admission.activeLimit,
        promotionAuthorized: false,
        productionTrafficAuthorized: false,
      },
    } : {}),
  }
}

/**
 * Bounded practical Residency tick.
 *
 * One invocation selects at most one enrollment and one practical case. The
 * exact trained artifact executes only inside the native sandbox Residency host,
 * every model-controlled action crosses Agent Gateway governance, and the
 * independent proof result is persisted before educational standing refresh.
 *
 * This route never enables the final-evaluation gate, graduates an artifact,
 * sends Production traffic, or widens authority.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized cron request.' },
      { status: 401 },
    )
  }

  if (!enabled()) {
    const body = {
      ok: true,
      state: 'disabled',
      automaticFinalGateEnable: false,
      promotionAuthorized: false,
      productionTrafficAuthorized: false,
    }
    await recordResidencyProductionPath(true, {
      runnerInvoked: false,
      skipped: true,
      status: 'disabled',
      ...body,
    })
    return NextResponse.json(body)
  }

  const db = getAdminSupabase()
  const store = createSupabaseBuilderResidencyOrchestratorStore({
    db,
    tenantId: RESIDENCY_TENANT,
    portableId: RESIDENCY_PORTABLE,
    agentId: RESIDENCY_AGENT,
    sandboxEnvironmentId: RESIDENCY_SANDBOX,
  })
  const executor = createLiveBuilderResidencyExecutor({ db })
  const harnessEvidenceSink =
    createSupervisorAuditHarnessEvidenceSink(db as any)

  try {
    // Admission is bounded separately from practical execution. At most one new
    // exact artifact is admitted per tick, and no more than four residents may
    // remain active concurrently.
    const admission = await admitNextBuilderResidency({ db, activeLimit: 4 })

    const result = await runBuilderResidencyOrchestrator({
      store,
      executor,
      harnessEvidenceSink,
      authorityFor: async () => createBuilderResidencyNativeAuthority(),
      requestedCapabilities: BUILDER_RESIDENCY_NATIVE_CAPABILITIES,
      repairInfrastructure: actuateBuilderResidencyRuntimeRecovery,
    })

    const body = publicResult(result, admission)
    await recordResidencyProductionPath(
      result.ok === true || result.state === 'waiting_for_residency_cases',
      {
        runnerInvoked: Boolean(result.practiceCase),
        status: result.state,
        residencyId: result.residencyId ?? null,
        coverage: result.coverage ?? null,
        admission: body.admission ?? null,
        selfHealing: body.selfHealing ?? null,
        automaticFinalGateEnable: false,
        promotionAuthorized: false,
        productionTrafficAuthorized: false,
      },
    )

    return NextResponse.json(body, {
      status: result.ok || result.state === 'waiting_for_residency_cases'
        ? 200
        : 503,
    })
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'builder_residency_cron_failed'
    await recordResidencyProductionPath(false, {
      runnerInvoked: true,
      status: 'failed',
      error: message,
      automaticFinalGateEnable: false,
      promotionAuthorized: false,
      productionTrafficAuthorized: false,
    })
    return NextResponse.json(
      {
        ok: false,
        state: 'failed',
        error: message,
        automaticFinalGateEnable: false,
        promotionAuthorized: false,
        productionTrafficAuthorized: false,
      },
      { status: 500 },
    )
  }
}
