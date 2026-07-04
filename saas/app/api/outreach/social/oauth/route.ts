import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { buildOAuthUrl, SOCIAL_CONNECTORS, SocialPlatform } from '@/lib/outreach/social-connectors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const platform = req.nextUrl.searchParams.get('platform') as SocialPlatform
  if (!platform || !SOCIAL_CONNECTORS[platform]) return NextResponse.json({ error: 'Unsupported social platform' }, { status: 400 })

  const redirectUri = `${req.nextUrl.origin}/api/outreach/social/oauth/callback`
  const state = `${ctx.user.id}:${platform}:${Date.now()}`
  const url = buildOAuthUrl(platform, redirectUri, state)

  await auditAdminAction({ admin: ctx.admin, actorId: ctx.user.id, action: 'outreach.social.oauth_start', targetType: 'social_connector', targetId: platform })

  // Human-facing behavior: send the admin straight to Google.
  // Debug/API behavior: keep JSON available with ?json=1.
  if (req.nextUrl.searchParams.get('json') === '1') {
    return NextResponse.json({ ok: true, platform, connector: SOCIAL_CONNECTORS[platform], url, userId: ctx.user.id })
  }

  return NextResponse.redirect(url)
}
