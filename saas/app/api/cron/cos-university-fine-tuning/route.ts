import { withScheduledProductionHarnessIngress } from '@/platform-harness/runtime/scheduled-ingress'
import { NextRequest, NextResponse } from 'next/server'
import { runCosUniversityControlledFineTuning } from '@/lib/ai/cos/cosUniversityControlledFineTuning'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { readCosUniversityDailyLaneCadence } from '@/lib/ai/cos/cosUniversityDailyLaneCadence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function GETInsideScheduledHarness(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const cadence = await readCosUniversityDailyLaneCadence('controlled_fine_tuning')
    if (!cadence.due) {
      await recordCosUniversityProductionPath({ path: 'controlled_fine_tuning', invocationSucceeded: true, evidence: { dailyCadence: 'not_due', runnerInvoked: false, cadence } })
      return NextResponse.json({ ok: true, skipped: true, cadence })
    }
    const result = await runCosUniversityControlledFineTuning(new Date())
    await recordCosUniversityProductionPath({ path: 'controlled_fine_tuning', invocationSucceeded: true, evidence: result })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordCosUniversityProductionPath({ path: 'controlled_fine_tuning', invocationSucceeded: false, evidence: { error: message } }).catch(() => null)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}


// Platform Harness scheduled ingress: no background worker logic starts outside a bounded run.
export async function GET(...args: Parameters<typeof GETInsideScheduledHarness>) {
  return withScheduledProductionHarnessIngress({ routePath: '/api/cron/cos-university-fine-tuning' }, async () => GETInsideScheduledHarness(...args))
}
