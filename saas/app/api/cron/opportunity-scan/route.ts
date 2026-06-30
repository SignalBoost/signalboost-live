// saas/app/api/cron/opportunity-scan/route.ts
// Daily continuous-scanner trigger, called automatically by Vercel Cron
// (see saas/vercel.json). Secured with CRON_SECRET: Vercel sends
// "Authorization: Bearer <CRON_SECRET>" with every cron invocation.

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { buildScanRequest } = await import('@/lib/ai/opportunityScanner')
  const { submitBatch } = await import('@/lib/ai/batch/openaiBatch')

  const req2 = await buildScanRequest()
  if (!req2.ok || !req2.body) {
    return NextResponse.json({ ok: false, error: req2.error || 'no scan request' }, { status: 500 })
  }
  const submitted = await submitBatch('opportunity_scan', [{ custom_id: 'scan', body: req2.body }], {})
  if (!submitted.ok) {
    return NextResponse.json({ ok: false, error: submitted.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, batchJob: submitted.jobId })
}
