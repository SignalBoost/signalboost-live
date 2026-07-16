import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { SupabaseExecutionRecordStore } from '@/lib/supervisor/persistence'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ executionId: string }> | { executionId: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const params = await ctx.params
  const store = new SupabaseExecutionRecordStore(auth.admin)
  const detail = await store.getExecution(params.executionId)
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ schemaVersion: 'supervisor-execution-detail-response-v1', ...detail })
}
