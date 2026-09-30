// saas/app/api/cron/cos-university-residency/route.ts
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
import { closeStaleStartedResidencyCases } from '@/platform-harness/residency/stale-case-sweep'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 600

const RESIDENCY_TENANT = 'itmounts-university'
const RESIDENCY_PORTABLE = 'builder-residency'
const RESIDENCY_AGENT = 'builder-resident'
const RESIDENCY_SANDBOX = 'builder-residency-sandbox-v1'
const RESIDENCY_CASES_PER_TICK = 4
// TIME BUDGET (2026-09-29). One case can take a 360s exact-artifact cold start plus a 240s harness deadline, which
// is the entire 600s invocation, yet up to four cases were started with no clock check. A case still running when
// Vercel kills the invocation is never recorded (no evidence, a stale 'started' row) and its resident is scheduled
// again. Start a case only when its harness deadline plus proof/recording fits in what is left of THIS invocation,
// and hand it only the remaining time for its cold start.
const RESIDENCY_INVOCATION_BUDGET_MS = 570_000
const RESIDENCY_CASE_EXECUTION_RESERVE_MS = 300_000
const RESIDENCY_MIN_READY_MS = 60_000

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

  const tickStartedAt = Date.now()
  const db = getAdminSupabase()
  const store = createSupabaseBuilderResidencyOrchestratorStore({
    db,
    tenantId: RESIDENCY_TENANT,
    portableId: RESIDENCY_PORTABLE,
    agentId: RESIDENCY_AGENT,
    sandboxEnvironmentId: RESIDENCY_SANDBOX,
  })
  const harnessEvidenceSink =
    createSupervisorAuditHarnessEvidenceSink(db as any)

  try {
    // Cases abandoned by a killed invocation are closed as harness failures (no evidence either way) so they stop
    // pinning their resident to the front of the queue. Best effort: a sweep failure never blocks the tick.
    const staleCases = await closeStaleStartedResidencyCases(db as any).catch((error: unknown) => ({
      closed: 0,
      residencyIds: [] as string[],
      errors: [error instanceof Error ? error.message.slice(0, 160) : 'stale_case_sweep_failed'],
    }))

    // Final results first. A resident that can no longer clear a remediation competency (too few untried
    // variants left for two distinct later passes) gets its Residency FAIL now, so it stops taking case
    // turns and never sits in PENDING. Production 2026-09-28: 26 of 37 active residents were in that state.
    const residencyFailures = await store.closeUnrecoverableResidencies()

    // Admission is bounded separately from practical execution. At most one new
    // exact artifact is admitted per tick, and no more than four residents may
    // remain active concurrently.
    const admission = await admitNextBuilderResidency({ db, activeLimit: 4 })

    // Drain a small cohort each tick instead of serializing the entire Residency
    // through one practical case every ten minutes. Every iteration independently
    // re-selects an enrollment and crosses the same authority/evidence boundaries.
    // Execution remains sequential to avoid multiplying RunPod worker pressure.
    const results:any[] = []
    let stoppedForTimeBudget = false
    for (let attempt = 0; attempt < RESIDENCY_CASES_PER_TICK; attempt += 1) {
      const readyBudgetMs = RESIDENCY_INVOCATION_BUDGET_MS - (Date.now() - tickStartedAt) - RESIDENCY_CASE_EXECUTION_RESERVE_MS
      if (readyBudgetMs < RESIDENCY_MIN_READY_MS) {
        stoppedForTimeBudget = true
        break
      }
      const executor = createLiveBuilderResidencyExecutor({ db, readyTimeoutMs: Math.min(360_000, readyBudgetMs) })
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
      if (result.state === 'case_not_completed') {
        const execution = result.execution as {
          result?: { outcome?: { status?: string } }
        }
        const selfHealing = 'selfHealing' in result
          ? result.selfHealing as { completed?: boolean }
          : undefined
        if (
          execution.result?.outcome?.status === 'infrastructure_failure' &&
          selfHealing?.completed !== true
        ) break
      }
    }

    if (!results.length) {
      const body = {
        ok: true,
        state: 'no_time_for_a_case',
        staleCases,
        residencyFailures: {
          checked: residencyFailures.checked,
          closed: residencyFailures.closedResidencyIds.length,
          residencyIds: residencyFailures.closedResidencyIds,
          quarantinedArtifacts: residencyFailures.quarantinedArtifacts,
          errors: residencyFailures.errors,
        },
        automaticFinalGateEnable: false,
        promotionAuthorized: false,
        productionTrafficAuthorized: false,
      }
      await recordResidencyProductionPath(true, { runnerInvoked: false, status: 'no_time_for_a_case', ...body })
      return NextResponse.json(body)
    }
    const result = results[results.length - 1]
    const invocationSucceeded = results.every(item =>
      item.ok === true || item.state === 'waiting_for_residency_cases',
    )
    const body = {
      ...publicResult(result, admission),
      staleCases,
      residencyFailures: {
        checked: residencyFailures.checked,
        closed: residencyFailures.closedResidencyIds.length,
        residencyIds: residencyFailures.closedResidencyIds,
        quarantinedArtifacts: residencyFailures.quarantinedArtifacts,
        errors: residencyFailures.errors,
      },
      batch: {
        attempted: results.length,
        completed: results.filter(item => item.state === 'case_completed').length,
        residencyFailed: results.filter(item => item.state === 'residency_failed').length,
        infrastructureBlocked: results.filter(item =>
          item.state === 'case_not_completed' &&
          item.execution?.result?.outcome?.status === 'infrastructure_failure'
        ).length,
        residencyIds: [...new Set(results
          .map(item => item.residencyId)
          .filter((value): value is string => typeof value === 'string' && value.length > 0))],
        maxCasesPerTick: RESIDENCY_CASES_PER_TICK,
        stoppedForTimeBudget,
        elapsedMs: Date.now() - tickStartedAt,
        parallelExecution: false,
      },
    }
    await recordResidencyProductionPath(invocationSucceeded, {
      runnerInvoked: results.some(item => Boolean(item.practiceCase)),
      status: invocationSucceeded ? 'batch_completed' : 'batch_partially_blocked',
      residencyId: body.residencyId ?? null,
      coverage: result.coverage ?? null,
      admission: body.admission ?? null,
      residencyFailures: body.residencyFailures,
      staleCases: body.staleCases,
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
// end of saas/app/api/cron/cos-university-residency/route.ts (if this line is missing, the paste was cut short)