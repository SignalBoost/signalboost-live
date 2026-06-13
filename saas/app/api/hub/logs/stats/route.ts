// saas/app/api/hub/logs/stats/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getLogStats } from '@/lib/hub/logs-service'

export async function GET(req: NextRequest) {
  try {
    const result = await getLogStats()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
