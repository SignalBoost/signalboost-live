// saas/app/api/cron/batch-poll/route.ts
// Retrieves completed OpenAI batches and dispatches their results to handlers.
// CRON_SECRET-gated like the other crons. Add a handler entry per batch kind.
import { NextRequest, NextResponse } from 'next/server'
import { pollBatches, type BatchHandler } from '@/lib/ai/batch/openaiBatch'
import { ingestScanAlerts } from '@/lib/ai/opportunityScanner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const handlers: Record<string, BatchHandler> = {
    opportunity_scan: async (outputs) => {
      await ingestScanAlerts(outputs[0]?.content || '[]')
    },
    // Future: campaign_copy, etc. — add one entry per batch kind.
  }

  const r = await pollBatches(handlers)
  return NextResponse.json(r, { status: r.ok ? 200 : 500 })
}
