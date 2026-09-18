import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityMassDistillationWorkflow } from '@/lib/ai/cos/cosUniversityMassDistillationWorkflow'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { response, invocationSucceeded, skipped } = await runCosUniversityMassDistillationWorkflow({
      source: 'scheduled_cron',
    })

    await recordCosUniversityProductionPath({
      path: 'mass_distillation_campaign',
      invocationSucceeded,
      evidence: { ...response, runnerInvoked: !skipped, skipped },
    })
    console.info('[cos-university-mass-distillation]', JSON.stringify(response))
    return NextResponse.json(response, {
      status: invocationSucceeded ? 200 : 503,
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
