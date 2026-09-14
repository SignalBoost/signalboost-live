import { NextRequest, NextResponse } from 'next/server'
import { runMassDistillationCampaignConsumer } from '@/lib/ai/cos/cosUniversityMassDistillationConsumer'
import { reconcileMassDistillationHuggingFaceJobs } from '@/lib/ai/cos/cosUniversityHuggingFaceJobReconciler'
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
    // Reconcile provider-accepted work before considering any new paid dispatch. A dead/timed-out
    // Hugging Face Job must become durable evidence before another batch can consume budget.
    const reconciliation = await reconcileMassDistillationHuggingFaceJobs({ maxJobs: 10 })
    const result = await runMassDistillationCampaignConsumer({ maxDispatches: 3 })
    const consumerSkipped = 'skipped' in result && result.skipped === true
    const reconciliationSkipped = 'skipped' in reconciliation && reconciliation.skipped === true
    const skipped = consumerSkipped && reconciliationSkipped
    const response = { ...result, reconciliation }
    const invocationSucceeded = (result.ok === true || consumerSkipped)
      && (reconciliation.ok === true || reconciliationSkipped)

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
