import { NextRequest, NextResponse } from 'next/server'
import { runMassDistillationCampaignConsumer } from '@/lib/ai/cos/cosUniversityMassDistillationConsumer'
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
    const result = await runMassDistillationCampaignConsumer({ maxDispatches: 3 })
    const skipped = 'skipped' in result && result.skipped === true
    await recordCosUniversityProductionPath({
      path: 'mass_distillation_campaign',
      invocationSucceeded: result.ok === true,
      evidence: { ...result, runnerInvoked: !skipped, skipped },
    })
    console.info('[cos-university-mass-distillation]', JSON.stringify(result))
    return NextResponse.json(result, {
      status: result.ok || skipped ? 200 : 503,
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
