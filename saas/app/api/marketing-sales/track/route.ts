// saas/app/api/marketing-sales/track/route.ts
// Public, fire-and-forget event capture for published campaign pages. It records
// a view/click into ms_events ONLY for a campaign that is really published, so the
// metrics that feed the optimization loop come from real public exposure — never
// from drafts, and never fabricated. No auth (it is a public page beacon); writes
// go through the service-role client server-side.
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch { /* empty */ }
  const campaignId = String(body.campaignId || '')
  const kind = String(body.kind || 'view')
  if (!campaignId || !['view', 'click'].includes(kind)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  try {
    const admin = getAdminSupabase()
    const { data: camp } = await admin
      .from('ms_campaigns').select('id, org_id, status').eq('id', campaignId).eq('status', 'published').maybeSingle()
    if (!camp) return NextResponse.json({ ok: true, skipped: true })
    await admin.from('ms_events').insert({ org_id: camp.org_id, campaign_id: campaignId, kind })
  } catch { /* never let tracking break the page */ }
  return NextResponse.json({ ok: true })
}
