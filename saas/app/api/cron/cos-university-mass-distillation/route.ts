import { NextRequest, NextResponse } from 'next/server'
import { runMassDistillationCampaignConsumer } from '@/lib/ai/cos/cosUniversityMassDistillationConsumer'
import { diagnoseFailedMassDistillationHuggingFaceJobs } from '@/lib/ai/cos/cosUniversityHuggingFaceJobDiagnostics'
import { reconcileMassDistillationHuggingFaceProviderLedger } from '@/lib/ai/cos/cosUniversityHuggingFaceProviderLedger'
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
    // Hydrate every accepted provider Job into the durable provider ledger, then reconcile terminal
    // provider cost before considering any new paid dispatch. This remains valid after a signed
    // worker callback has already advanced the run to its next stage.
    const reconciliation = await reconcileMassDistillationHuggingFaceProviderLedger({ maxJobs: 15 })
    // Terminal failures are diagnosed read-only after settlement so any later explicit recovery is
    // grounded in provider logs rather than a generic ERROR stage or guessed failure cause.
    const diagnostics = await diagnoseFailedMassDistillationHuggingFaceJobs({ maxJobs: 5 })
    const result = await runMassDistillationCampaignConsumer({ maxDispatches: 3 })
    const consumerSkipped = 'skipped' in result && result.skipped === true
    const reconciliationSkipped = 'skipped' in reconciliation && reconciliation.skipped === true
    const diagnosticsSkipped = 'skipped' in diagnostics && diagnostics.skipped === true
    const skipped = consumerSkipped && reconciliationSkipped && diagnosticsSkipped
    const response = { ...result, reconciliation, diagnostics }
    const invocationSucceeded = (result.ok === true || consumerSkipped)
      && (reconciliation.ok === true || reconciliationSkipped)
      && (diagnostics.ok === true || diagnosticsSkipped)

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
