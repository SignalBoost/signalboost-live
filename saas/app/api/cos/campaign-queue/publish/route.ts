// saas/app/api/cos/campaign-queue/publish/route.ts
// Publish an APPROVED COS campaign item to a live social platform — thin HTTP
// wrapper over lib/cos/campaign-queue/publish-core.ts, which holds ALL gates:
//   - THE OWNER GATE: approved_at/approved_by must be set (nulled on rejection);
//     status must be in the approved | queued | running band.
//   - Video ready + branded (acceptUnbranded:true is a logged owner override).
//   - COSA quality/readiness gate.
//   - Traffic attribution link appended; owner emailed the live link.
// The same core is invoked automatically on approval (PATCH status=approved in
// ../route.ts) — this endpoint remains for manual/per-language re-publish.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { publishCampaignCore } from '@/lib/cos/campaign-queue/publish-core'
import type { SocialPlatform } from '@/lib/outreach/social-connectors'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch {}

  const res = await publishCampaignCore({
    admin: ctx.admin,
    userId: ctx.user.id,
    userEmail: ctx.user.email || null,
    id: String(body?.id || ''),
    language: typeof body?.language === 'string' ? body.language : undefined,
    acceptUnbranded: body?.acceptUnbranded === true,
    platform: body?.platform as SocialPlatform | undefined,
    text: typeof body?.text === 'string' ? body.text : undefined,
    videoUrl: typeof body?.videoUrl === 'string' ? body.videoUrl : undefined,
    title: typeof body?.title === 'string' ? body.title : undefined,
  })

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.error, platform: res.platform, result: res.result, readiness: res.readiness, voiceError: res.voiceError },
      { status: res.status },
    )
  }

  return NextResponse.json({
    ok: true,
    platform: res.platform,
    language: res.language,
    publishedAt: res.publishedAt,
    result: res.result,
    readiness: res.readiness,
    notified: res.notified,
    trackingUrl: res.trackingUrl,
  })
}
