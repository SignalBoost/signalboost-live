import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { defaultApprovalQueueStore } from '@/lib/supervisor/approvals'
export async function GET() { const auth = await requireAdmin(); if (auth instanceof NextResponse) return auth; const items = await defaultApprovalQueueStore.listPendingRequests(); return NextResponse.json({ schemaVersion:'supervisor-approval-list-response-v1', items: items.map(i=>({ ...i, actionable: i.environment === 'sandbox' })) }) }
