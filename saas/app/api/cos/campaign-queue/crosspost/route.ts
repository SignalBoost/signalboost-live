// saas/app/api/cos/campaign-queue/crosspost/route.ts
// Cross-post an already-approved campaign's finished branded video to an ADDITIONAL
// platform (e.g. TikTok, Instagram) after it has gone to YouTube. Reuses the shared
// publish core (which accepts approved | queued | running and enforces every gate:
// owner approval, finished+branded video, readiness, tracking link) so this is not a
// parallel publisher. The video attaches automatically because the source campaign is
// a video channel; the target platform is passed as an explicit override.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { publishCampaignCore } from '@/lib/cos/campaign-queue/publish-core'
import { SOCIAL_CONNECTORS, type SocialPlatform } from '@/lib/outreach/social-connectors'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch {}
  const id = String(body?.id || '').trim()
  const platform = String(body?.platform || '') as SocialPlatform
  const language = String(body?.language || '').trim()

  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  if (!platform || !SOCIAL_CONNECTORS[platform]) return NextResponse.json({ ok: false, error: 'Unsupported platform' }, { status: 400 })

  const res = await publishCampaignCore({
    admin: ctx.admin,
    userId: ctx.user.id,
    userEmail: ctx.user.email,
    id,
    platform,
    ...(language ? { language } : {}),
  })
  if (!res.ok) return NextResponse.json(res, { status: res.status || 400 })

  const liveUrl = String(res.result?.liveUrl || '').trim()
  let notified = false
  if (liveUrl && ctx.user.email) {
    const label = SOCIAL_CONNECTORS[platform]?.label || platform
    const sent = await sendEmail({
      from: 'saasMarketing',
      to: ctx.user.email,
      subject: `🎬 Cross-posted to ${label}`,
      html: `<p>Your approved video was cross-posted to <strong>${label}</strong>.</p><p><a href="${liveUrl}">${liveUrl}</a></p><p>Clicks on the link are tracked automatically.</p>`.trim(),
    }).catch(() => null)
    notified = Boolean(sent?.ok)
  }

  return NextResponse.json({ ok: true, platform, liveUrl, notified, result: res.result })
}
