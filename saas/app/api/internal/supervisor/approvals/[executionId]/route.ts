import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { defaultApprovalQueueStore } from '@/lib/supervisor/approvals'
export async function GET(_req: NextRequest, ctx: { params: Promise<{ executionId: string }> }) { const auth = await requireAdmin(); if (auth instanceof NextResponse) return auth; const { executionId } = await ctx.params; const item = await defaultApprovalQueueStore.getRequest(executionId); if (!item) return NextResponse.json({ code:'request_not_found' }, { status:404 }); return NextResponse.json({ schemaVersion:'supervisor-approval-detail-response-v1', item }) }
