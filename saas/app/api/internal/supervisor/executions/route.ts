import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { SupabaseExecutionRecordStore } from '@/lib/supervisor/persistence'
import type { ExecutionStatus } from '@/lib/supervisor/persistence'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 25), 1), 100)
  const store = new SupabaseExecutionRecordStore(auth.admin)
  const result = await store.listExecutions({
    status: (url.searchParams.get('status') || undefined) as ExecutionStatus | undefined,
    provider: url.searchParams.get('provider') || undefined,
    environment: url.searchParams.get('environment') || undefined,
    incidentId: url.searchParams.get('incidentId') || undefined,
    dateFrom: url.searchParams.get('dateFrom') || undefined,
    dateTo: url.searchParams.get('dateTo') || undefined,
    cursor: url.searchParams.get('cursor') || undefined,
    limit,
  })
  return NextResponse.json({ schemaVersion: 'supervisor-execution-list-response-v1', items: result.items, nextCursor: result.nextCursor })
}
