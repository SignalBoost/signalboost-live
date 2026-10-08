// saas/app/api/cron/cos-university-mass-distillation/route.ts
import { NextRequest, NextResponse } from 'next/server'
import {
  runCosUniversityMassDistillationExperimentWorkflow,
  runCosUniversityMassDistillationWorkflow,
} from '@/lib/ai/cos/cosUniversityMassDistillationWorkflow'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { pausedStationResponse } from '@/lib/ai/cos/cosUniversitySettings'
import { experimentScopeEvidence, resolveUniversityStationScope } from '@/lib/ai/cos/itmountsLabExperimentStationScope'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  // Owner 2026-10-04: the production pause switch, set from the University telemetry page. Paused = no new campaign.
  // Owner 2026-10-07: while paused, a live Lab experiment grant advances only that experiment's own campaign.
  const scope = await resolveUniversityStationScope({ db: cosServiceDb() })
  if (scope.run === 'paused') return NextResponse.json(pausedStationResponse('cos-university-mass-distillation'))

  try {
    const { response, invocationSucceeded, transportSucceeded, skipped } = scope.run === 'experiment'
      ? await runCosUniversityMassDistillationExperimentWorkflow({ campaignIds: scope.campaignIds })
      : await runCosUniversityMassDistillationWorkflow({ source: 'scheduled_cron' })
    const experimentScope = experimentScopeEvidence(scope)

    await recordCosUniversityProductionPath({
      path: 'mass_distillation_campaign',
      invocationSucceeded,
      evidence: { ...response, transportSucceeded, runnerInvoked: !skipped, skipped, experimentScope },
    })
    console.info('[cos-university-mass-distillation]', JSON.stringify({ ...response, experimentScope }))
    return NextResponse.json({ ...response, experimentScope }, {
      status: transportSucceeded ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordCosUniversityProductionPath({
      path: 'mass_distillation_campaign',
      invocationSucceeded: false,
      evidence: { error: message, runnerInvoked: true },
    }).catch(() => null)
    console.error('[cos-university-mass-distillation]', JSON.stringify({ ok: false, error: message }))
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
// end of saas/app/api/cron/cos-university-mass-distillation/route.ts (if this line is missing, the paste was cut short)
