import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { SOCIAL_CONNECTORS, platformNeedsAccountRef, type SocialPlatform } from '@/lib/outreach/social-connectors'

export const dynamic = 'force-dynamic'

function isPlatform(value: string): value is SocialPlatform {
  return Boolean((SOCIAL_CONNECTORS as any)[value])
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const platform = String(body?.platform || '')
  const accountRef = String(body?.account_ref || body?.accountRef || '').trim()
  const accountName = body?.account_name || body?.accountName ? String(body.account_name || body.accountName).trim() : null

  if (!isPlatform(platform)) return NextResponse.json({ ok: false, error: 'Unsupported social platform.' }, { status: 400 })
  if (platformNeedsAccountRef(platform) && !accountRef) return NextResponse.json({ ok: false, error: `${platform} requires account_ref.` }, { status: 400 })

  const { data: existing, error: loadError } = await ctx.admin
    .from('outreach_social_tokens')
    .select('*')
    .eq('user_id', ctx.user.id)
    .eq('platform', platform)
    .maybeSingle()

  if (loadError) return NextResponse.json({ ok: false, error: loadError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ ok: false, error: `${platform} must be connected before setting account_ref.` }, { status: 409 })

  const { data, error } = await ctx.admin
    .from('outreach_social_tokens')
    .update({ account_ref: accountRef || null, account_name: accountName, updated_at: new Date().toISOString() })
    .eq('user_id', ctx.user.id)
    .eq('platform', platform)
    .select('platform, account_ref, account_name, expires_at, scopes')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'outreach.social.account_ref.update',
    targetType: 'outreach_social_tokens',
    targetId: platform,
    metadata: { platform, accountRef, accountName },
  })

  return NextResponse.json({ ok: true, token: data })
}
