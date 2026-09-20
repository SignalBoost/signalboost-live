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

  // Temporary Sep 18 control-plane forensics. Run concurrently so evidence capture cannot delay
  // the University workflow. Hard sunset prevents repeated historical queries if cleanup is delayed.
  const forensicCapture = Date.now() < Date.parse('2026-09-19T01:15:00Z')
    ? (() => {
        const configured = String(process.env.NEXT_PUBLIC_APP_URL || '').trim()
        const vercelProduction = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim()
        const baseUrl = configured
          ? configured.replace(/\/+$/, '')
          : vercelProduction
            ? `https://${vercelProduction.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
            : 'https://itmounts.com'
        return fetch(`${baseUrl}/api/cron/vercel-cron-forensics`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${secret}`, 'User-Agent': 'SignalBoost-University-Forensics/1.0' },
          cache: 'no-store',
          signal: AbortSignal.timeout(25_000),
        }).then(async response => {
          console.info('[vercel-cron-forensics-minute-trigger]', { status: response.status })
          try { await response.body?.cancel() } catch {}
        }).catch(error => {
          console.warn('[vercel-cron-forensics-minute-trigger] failed', error instanceof Error ? error.message : String(error))
        })
      })()
    : Promise.resolve()
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
    await forensicCapture
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
