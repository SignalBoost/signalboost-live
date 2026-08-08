// saas/app/api/outreach/queue-view/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, enforceDailySendLimit } from '@/lib/outreach/security'
import { applyOutreachSignature } from '@/lib/outreach/signature'
import { reportLangFromCookie } from '@/lib/i18n/reportLanguage'

export const dynamic = 'force-dynamic'

function withChannel(row: any) {
  const website = row?.website_json && typeof row.website_json === 'object' ? row.website_json : {}
  const analyzer = row?.analyzer_summary && typeof row.analyzer_summary === 'object' ? row.analyzer_summary : {}
  const channel = row?.outreach_channel || row?.channel || website.outreach_channel || website.channel || analyzer.outreach_channel || analyzer.channel || ''
  return { ...row, outreach_channel: channel, channel }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const status = req.nextUrl.searchParams.get('status')
  const channel = req.nextUrl.searchParams.get('channel')
  const locale = reportLangFromCookie(req.headers.get('cookie'))

  // This endpoint is intentionally data-only. Generated draft translation belongs in
  // GeneratedContentLocalizer for the visible rows, not on the critical queue-read path.
  // Release-time localization remains in /api/outreach/queue PATCH and send-ready.
  const PAGE_SIZE = 1000
  const rows: any[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = ctx.admin
      .from('outreach_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const page = data || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  const normalized = rows.map((row: any) => {
    const body = String(row.outreach_message || '')
    return {
      ...withChannel(row),
      outreach_message: body,
      // Signature copy is cheap and deterministic. The generated body is translated in
      // the browser only for rendered drafts; approval translates again authoritatively.
      outbound_message: applyOutreachSignature(body, row.sender_key || 'saasSales', locale),
    }
  })

  const outreach = channel
    ? normalized.filter((row: any) => row.outreach_channel === channel || row.channel === channel)
    : normalized
  const sendLimit = await enforceDailySendLimit(ctx.admin)

  return NextResponse.json({
    outreach,
    total: outreach.length,
    locale,
    sendLimit,
  })
}
