// saas/app/api/my-outreach/route.ts
// Customer-facing outreach API (Growth/Command plans, admins included):
//   GET   → list the caller's own drafts
//   POST  → create a draft for the caller's own business
//   PATCH → approve/reject the caller's own draft
// All operations are scoped to the authenticated user's rows.

import { NextRequest, NextResponse } from 'next/server'
import {
  getCustomerOutreachAccess,
  createCustomerDraft,
  listCustomerDrafts,
  setCustomerDraftStatus,
  DAILY_DRAFT_CAP,
  countDraftsToday,
} from '@/lib/outreach/customer'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await getCustomerOutreachAccess()
  if (!access.ok) {
    return NextResponse.json({ error: access.error, reason: access.reason }, { status: access.status })
  }
  const result = await listCustomerDrafts(access.userId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  const used = await countDraftsToday(access.userId)
  return NextResponse.json({ drafts: result.drafts, dailyCap: DAILY_DRAFT_CAP, usedToday: used })
}

export async function POST(req: NextRequest) {
  const access = await getCustomerOutreachAccess()
  if (!access.ok) {
    return NextResponse.json({ error: access.error, reason: access.reason }, { status: access.status })
  }

  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const result = await createCustomerDraft({
    userId: access.userId,
    businessName: String(body?.businessName || ''),
    businessUrl: String(body?.businessUrl || ''),
    message: String(body?.message || ''),
    source: 'manual',
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, id: result.id })
}

export async function PATCH(req: NextRequest) {
  const access = await getCustomerOutreachAccess()
  if (!access.ok) {
    return NextResponse.json({ error: access.error, reason: access.reason }, { status: access.status })
  }

  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const id = String(body?.id || '')
  const status = String(body?.status || '')
  if (!id || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Provide id and status (approved/rejected).' }, { status: 400 })
  }

  const result = await setCustomerDraftStatus(access.userId, id, status as 'approved' | 'rejected')
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === 'Draft not found.' ? 404 : 500 })
  }
  return NextResponse.json({ ok: true })
}
