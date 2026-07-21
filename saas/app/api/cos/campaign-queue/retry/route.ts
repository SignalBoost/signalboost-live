// saas/app/api/cos/campaign-queue/retry/route.ts
// "Publish now / Retry" for a stuck video. A video that sits in APPROVED — PUBLISHING
// for days is stalled (the publish attempt failed — usually an expired YouTube token —
// and nothing self-heals). This re-runs the SAME shared publish core the pipeline uses,
// with NO platform override so it re-attempts the campaign's native channel (YouTube for
// video). If the token is valid it publishes + emails the live link; if not, it returns
// the real provider error (so the fix — Reconnect YouTube — is obvious) instead of
// hanging silently. COS can call this same path; this button is the buyer-facing twin.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { publishCampaignCore } from '@/lib/cos/campaign-queue/publish-core'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch {}
  const id = String(body?.id || '').trim()
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })

  const res = await publishCampaignCore({
    admin: ctx.admin,
    userId: ctx.user.id,
    userEmail: ctx.user.email,
    id,
  })
  if (!res.ok) return NextResponse.json(res, { status: res.status || 400 })

  const liveUrl = String(res.result?.liveUrl || '').trim()
  let notified = false
  if (liveUrl && ctx.user.email) {
    const sent = await sendEmail({
      from: 'saasMarketing',
      to: ctx.user.email,
      subject: '🎬 Your video is live',
      html: `<p>Your approved video finished publishing.</p><p><a href="${liveUrl}">${liveUrl}</a></p>`.trim(),
    }).catch(() => null)
    notified = Boolean(sent?.ok)
  }
  return NextResponse.json({ ok: true, liveUrl, notified, result: res.result })
}
