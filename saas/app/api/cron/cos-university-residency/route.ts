import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import {
  BUILDER_RESIDENCY_NATIVE_CAPABILITIES,
  createBuilderResidencyNativeAuthority,
  createLiveBuilderResidencyExecutor,
} from '@/platform-harness/residency/live-builder-executor'
import { runBuilderResidencyOrchestrator } from '@/platform-harness/residency/orchestrator'
import { createSupabaseBuilderResidencyOrchestratorStore } from '@/platform-harness/residency/orchestrator-store'
import { createSupervisorAuditHarnessEvidenceSink } from '@/platform-harness/evidence/supervisor-audit-sink'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

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

function publicResult(result: Awaited<ReturnType<typeof runBuilderResidencyOrchestrator>>) {
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
    return NextResponse.json({
      ok: true,
      state: 'disabled',
      automaticFinalGateEnable: false,
      promotionAuthorized: false,
      productionTrafficAuthorized: false,
    })
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
    const result = await runBuilderResidencyOrchestrator({
      store,
      executor,
      harnessEvidenceSink,
      authorityFor: async () => createBuilderResidencyNativeAuthority(),
      requestedCapabilities: BUILDER_RESIDENCY_NATIVE_CAPABILITIES,
    })

    return NextResponse.json(publicResult(result), {
      status: result.ok || result.state === 'waiting_for_residency_cases'
        ? 200
        : 503,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        state: 'failed',
        error: error instanceof Error
          ? error.message
          : 'builder_residency_cron_failed',
        automaticFinalGateEnable: false,
        promotionAuthorized: false,
        productionTrafficAuthorized: false,
      },
      { status: 500 },
    )
  }
}
