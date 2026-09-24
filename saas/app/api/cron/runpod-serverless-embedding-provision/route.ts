import { withScheduledProductionHarnessIngress } from '@/platform-harness/runtime/scheduled-ingress'
import { NextRequest, NextResponse } from 'next/server'
import { provisionRunpodServerlessEmbedding } from '@/lib/ai/cos/runpodServerlessEmbeddingProvision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function provisioningEnabled(): boolean {
  return process.env.RUNPOD_SERVERLESS_EMBEDDING_PROVISION_ENABLED?.trim().toLowerCase() === 'true'
}

async function GETInsideScheduledHarness(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (!provisioningEnabled()) {
    return NextResponse.json({
      ok: true,
      provisioned: false,
      reason: 'explicit_provisioning_latch_disabled',
      gpuWorkerStarted: false,
      activationPerformed: false,
    })
  }

  try {
    const result = await provisionRunpodServerlessEmbedding()
    console.info('[runpod-serverless-embedding-provision]', JSON.stringify({
      ok: true,
      ...result,
      rootRunpodCredentialExposed: false,
      gpuWorkerStarted: false,
      activationPerformed: false,
    }))
    return NextResponse.json({
      ok: true,
      ...result,
      gpuWorkerStarted: false,
      activationPerformed: false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RunPod serverless embedding provision failed'
    console.error('[runpod-serverless-embedding-provision]', JSON.stringify({ ok: false, error: message }))
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}


// Platform Harness scheduled ingress: no background worker logic starts outside a bounded run.
export async function GET(...args: Parameters<typeof GETInsideScheduledHarness>) {
  return withScheduledProductionHarnessIngress({ routePath: '/api/cron/runpod-serverless-embedding-provision' }, async () => GETInsideScheduledHarness(...args))
}
