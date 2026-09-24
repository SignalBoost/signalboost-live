import { withScheduledProductionHarnessIngress } from '@/platform-harness/runtime/scheduled-ingress'
import { NextRequest, NextResponse } from 'next/server'
import { ensureWorkingCosCandidateReadiness } from '@/lib/ai/cos/cosWorkingDistillationDispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function GETInsideScheduledHarness(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await ensureWorkingCosCandidateReadiness()
    console.info('[working-cos-readiness]', JSON.stringify({
      ok: true,
      candidateId: result.candidateId,
      bundleKey: result.bundleKey,
      datasetHash: result.datasetHash,
      itemCount: result.itemCount,
      subjectCount: result.subjectCount,
      runtimeModel: result.runtimeModel,
      runtimeDigest: result.runtimeDigest,
      nextGate: result.nextGate,
    }))
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[working-cos-readiness]', JSON.stringify({ ok: false, error: message }))
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}


// Platform Harness scheduled ingress: no background worker logic starts outside a bounded run.
export async function GET(...args: Parameters<typeof GETInsideScheduledHarness>) {
  return withScheduledProductionHarnessIngress({ routePath: '/api/cron/cos-working-distillation-readiness' }, async () => GETInsideScheduledHarness(...args))
}
