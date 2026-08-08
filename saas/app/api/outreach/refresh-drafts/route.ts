// saas/app/api/outreach/refresh-drafts/route.ts
//
// Preview and apply a rewrite of pending outreach drafts against the current product
// manifests.
//
// GET  — always a dry run. Returns what WOULD change, old body beside new, writing nothing.
// POST — applies it. Requires an explicit { "apply": true } in the body, because a hundred
//        drafts is a hundred first impressions and a misfire is not undoable from here.
//
// Owner-gated through the same requireAdmin used by every other outreach route: this
// rewrites what is about to be sent under the company's name.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { refreshPendingDrafts } from '@/lib/outreach/refreshDrafts'
import { localizeOutreachDrafts } from '@/lib/outreach/localizeDrafts'
import { reportLangFromCookie } from '@/lib/i18n/reportLanguage'

export const runtime = 'nodejs'
// Regenerating drafts is one model call per row, so the ceiling is generous and the
// caller is expected to page with `limit` rather than rewrite hundreds in one request.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const limit = Number(req.nextUrl.searchParams.get('limit') || 5)
  const offset = Number(req.nextUrl.searchParams.get('offset') || 0)
  const productKey = req.nextUrl.searchParams.get('productKey')

  try {
    const report = await refreshPendingDrafts({ dryRun: true, limit, offset, productKey })
    return NextResponse.json(report, { status: report.ok ? 200 : 500 })
  } catch (error: any) {
    // Always JSON. An exception escaping here becomes the platform's plain-text error
    // page, and the browser reports it as "Unexpected token 'A'" — which tells the person
    // nothing about what went wrong.
    return NextResponse.json({ ok: false, error: String(error?.message || error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch { body = {} }

  // Deliberately not inferred from the method. A POST that rewrites a hundred customer-
  // facing messages should have said so in words.
  if (body?.apply !== true) {
    return NextResponse.json({
      ok: false,
      error: 'Send { "apply": true } to write the refreshed drafts. Use GET first to review what would change.',
    }, { status: 400 })
  }

  let report
  let localization: Awaited<ReturnType<typeof localizeOutreachDrafts>> | null = null
  try {
    report = await refreshPendingDrafts({
      dryRun: false,
      // Small on purpose. One row is one model call; a large page cannot finish inside a
      // serverless function, and a request that dies mid-way writes some rows and reports
      // none of them. The caller pages instead.
      limit: Number(body.limit || 12),
      offset: Number(body.offset || 0),
      productKey: body.productKey ?? null,
    })

    // Generated email bodies are platform-generated content, so they use the SAME locale
    // engine as reports/documents instead of maintaining an outreach-only translation path.
    // The selected SignalBoost locale is read from the normal language cookie.
    const locale = reportLangFromCookie(req.headers.get('cookie'))
    const refreshedIds = report.outcomes
      .filter((item: any) => item?.status === 'refreshed' && item?.outreachId)
      .map((item: any) => String(item.outreachId))

    localization = await localizeOutreachDrafts({
      admin: ctx.admin,
      outreachIds: refreshedIds,
      locale,
    })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: String(error?.message || error) }, { status: 500 })
  }

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'outreach.drafts_refreshed',
    targetType: 'outreach_queue',
    metadata: {
      examined: report.examined,
      refreshed: report.refreshed,
      skipped: report.skipped,
      failed: report.failed,
      productKey: body.productKey ?? null,
      locale: localization?.locale || null,
      localized: localization?.localized || 0,
      localizationFailed: localization?.failed || 0,
    },
  })

  // The bodies themselves are omitted from the response on apply: the point of this call
  // is the count and the exceptions, and returning a hundred full messages buries both.
  return NextResponse.json({
    ...report,
    localization,
    outcomes: report.outcomes.map(({ previousMessage, newMessage, ...rest }) => rest),
  }, { status: report.ok && !(localization?.failed) ? 200 : 500 })
}
