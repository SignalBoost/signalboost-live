import { NextRequest, NextResponse } from 'next/server'
import { runUniversityDistilledArtifactEvaluation } from '@/lib/ai/cos/cosUniversityDistilledArtifactEvaluation'
import { runUniversityMassDistilledArtifactEvaluation } from '@/lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation'
import { reconcileMassDistilledEvaluationClaims } from '@/lib/ai/cos/cosUniversityMassDistilledClaimReconciliation'
import { independentEvaluatorConfig } from '@/lib/ai/cos/cosUniversityIndependentEvaluator'
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
    // The evaluation engine keeps its existing fail-closed env seam. When no explicit Vercel secret
    // exists, hydrate only this server invocation from the separately generated service-only Vault key.
    const evaluator = await independentEvaluatorConfig()
    if (evaluator && !process.env.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET) {
      process.env.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET = evaluator.secret
    }

    // Repair any missing idempotent signed scorer claim from a previously stored evaluation before
    // considering new provider work. This path performs zero RunPod calls, judge calls, or dataset reads.
    const claimRepair = await reconcileMassDistilledEvaluationClaims(new Date())
    if ('repaired' in claimRepair && claimRepair.repaired === true) {
      await recordCosUniversityProductionPath({
        path: 'distilled_independent_evaluation',
        invocationSucceeded: true,
        evidence: { ...claimRepair, massLaneChecked: true, claimRepairOnly: true, runnerInvoked: true, skipped: false },
      })
      console.info('[cos-distilled-independent-evaluation]', JSON.stringify(claimRepair))
      return NextResponse.json(claimRepair, {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      })
    }

    // Mass-distillation artifacts have priority whenever actionable work exists, but retention waits
    // must not starve the legacy study-plan evaluator. Release the shared cron when the mass lane is idle.
    const mass = await runUniversityMassDistilledArtifactEvaluation(new Date())
    const massIdle = 'skipped' in mass && mass.skipped === true
      && ['no_mass_evaluation_pending_artifact', 'mass_evaluation_work_not_due'].includes(String(mass.reason || ''))
    const result = massIdle ? await runUniversityDistilledArtifactEvaluation(new Date()) : mass
    const skipped = 'skipped' in result && result.skipped === true
    await recordCosUniversityProductionPath({
      path: 'distilled_independent_evaluation',
      invocationSucceeded: result.ok === true,
      evidence: { ...result, massLaneChecked: true, massLaneIdle: massIdle, massLaneResult: mass, claimRepairChecked: true, runnerInvoked: !skipped, skipped },
    })
    console.info('[cos-distilled-independent-evaluation]', JSON.stringify(result))
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordCosUniversityProductionPath({
      path: 'distilled_independent_evaluation',
      invocationSucceeded: false,
      evidence: { error: message, massLaneChecked: true, claimRepairChecked: true, runnerInvoked: true },
    }).catch(() => null)
    console.error('[cos-distilled-independent-evaluation]', JSON.stringify({ ok: false, error: message }))
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
