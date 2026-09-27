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
const RESIDENCY_CASES_PER_TICK = 4

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
 * One invocation executes a bounded sequential cohort of practical cases. Each
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

    // Drain a small cohort each tick instead of serializing the entire Residency
    // through one practical case every ten minutes. Every iteration independently
    // re-selects an enrollment and crosses the same authority/evidence boundaries.
    // Execution remains sequential to avoid multiplying RunPod worker pressure.
    const results:any[] = []
    for (let attempt = 0; attempt < RESIDENCY_CASES_PER_TICK; attempt += 1) {
      const result = await runBuilderResidencyOrchestrator({
        store,
        executor,
        harnessEvidenceSink,
        authorityFor: async () => createBuilderResidencyNativeAuthority(),
        requestedCapabilities: BUILDER_RESIDENCY_NATIVE_CAPABILITIES,
        repairInfrastructure: actuateBuilderResidencyRuntimeRecovery,
      })
      results.push(result)
      if (result.state === 'idle') break

      // Infrastructure is a prerequisite, not educational evidence. Once an exact-artifact
      // execution reports infrastructure failure, the existing governed Self-Healing action gets
      // one opportunity to reconcile it. If that action does not complete, stop this cron batch:
      // additional case attempts cannot prove competency and only create retry churn.
      if (
        result.state === 'case_not_completed' &&
        result.execution?.result?.outcome?.status === 'infrastructure_failure' &&
        result.selfHealing?.completed !== true
      ) break
    }

    const result = results[results.length - 1]
    const invocationSucceeded = results.every(item =>
      item.ok === true || item.state === 'waiting_for_residency_cases',
    )
    const body = {
      ...publicResult(result, admission),
      batch: {
        attempted: results.length,
        completed: results.filter(item => item.state === 'case_completed').length,
        infrastructureBlocked: results.filter(item =>
          item.state === 'case_not_completed' &&
          item.execution?.result?.outcome?.status === 'infrastructure_failure'
        ).length,
        residencyIds: [...new Set(results
          .map(item => item.residencyId)
          .filter((value): value is string => typeof value === 'string' && value.length > 0))],
        maxCasesPerTick: RESIDENCY_CASES_PER_TICK,
        parallelExecution: false,
      },
    }
    await recordResidencyProductionPath(invocationSucceeded, {
      runnerInvoked: results.some(item => Boolean(item.practiceCase)),
      status: invocationSucceeded ? 'batch_completed' : 'batch_partially_blocked',
      residencyId: body.residencyId ?? null,
      coverage: result.coverage ?? null,
      admission: body.admission ?? null,
      selfHealing: body.selfHealing ?? null,
      batch: body.batch,
      automaticFinalGateEnable: false,
      promotionAuthorized: false,
      productionTrafficAuthorized: false,
    })

    return NextResponse.json(body, {
      status: invocationSucceeded ? 200 : 503,
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
