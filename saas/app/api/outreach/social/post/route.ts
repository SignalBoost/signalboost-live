import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction, enforceDailySendLimit, isOutreachSendingDisabled } from '@/lib/outreach/security'
import { publishSocialPost, SOCIAL_CONNECTORS, SocialPlatform } from '@/lib/outreach/social-connectors'
import { getValidSocialToken } from '@/lib/outreach/social-token'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const platform = String(body?.platform || '') as SocialPlatform
  const outreachId = String(body?.outreach_id || '').trim()
  if (!SOCIAL_CONNECTORS[platform]) return NextResponse.json({ error: 'Unsupported social platform' }, { status: 400 })
  if (!outreachId) return NextResponse.json({ error: 'outreach_id is required' }, { status: 400 })
  if (await isOutreachSendingDisabled(ctx.admin)) return NextResponse.json({ error: 'Outreach sending is disabled by the panic switch.' }, { status: 423 })

  const limit = await enforceDailySendLimit(ctx.admin, 50)
  if (!limit.ok) return NextResponse.json({ error: 'Daily outreach send limit reached', sendLimit: limit }, { status: 429 })

  const { data: outreach, error } = await ctx.admin.from('outreach_queue').select('*').eq('id', outreachId).single()
  if (error || !outreach) return NextResponse.json({ error: error?.message || 'Outreach not found' }, { status: 404 })
  if (outreach.status !== 'approved') return NextResponse.json({ error: 'Social outreach must be approved before sending.' }, { status: 409 })

  const tok = await getValidSocialToken(ctx.admin, ctx.user.id, platform)
  if (!tok.ok || !tok.accessToken) return NextResponse.json({ error: tok.error || `${platform} is not connected.` }, { status: 400 })

  const accountRef = body?.account_ref ? String(body.account_ref) : tok.accountRef || undefined
  const result = await publishSocialPost({
    platform,
    text: String(body?.text || outreach.outreach_message || ''),
    title: body?.title ? String(body.title) : String(outreach.business_name || 'SignalBoost outreach'),
    imageUrl: body?.image_url ? String(body.image_url) : undefined,
    videoUrl: body?.video_url ? String(body.video_url) : undefined,
    accessToken: tok.accessToken,
    accountRef,
  })

  if (!result.ok) {
    await auditAdminAction({ admin: ctx.admin, actorId: ctx.user.id, action: 'outreach.social.post_failed', targetType: 'outreach_queue', targetId: outreachId, metadata: { platform, mode: result.mode, accountRef: accountRef || null } })
    return NextResponse.json({ error: result.mode || 'Social publish failed', platform, result }, { status: 502 })
  }

  const sentAt = new Date().toISOString()
  const { error: sendError } = await ctx.admin.from('outreach_sends').insert({ outreach_id: outreachId, business_id: outreach.business_id, channel: platform, sent_at: sentAt, metadata: { providerResult: result, metrics: result.metrics, accountRef: accountRef || null, accountName: tok.accountName || null } })
  if (sendError) return NextResponse.json({ error: sendError.message }, { status: 500 })
  await ctx.admin.from('outreach_queue').update({ status: 'sent', sent_at: sentAt }).eq('id', outreachId)
  await auditAdminAction({ admin: ctx.admin, actorId: ctx.user.id, action: 'outreach.social.post', targetType: 'outreach_queue', targetId: outreachId, metadata: { platform, providerPostId: result.providerPostId, liveUrl: result.liveUrl, metrics: result.metrics, accountRef: accountRef || null } })

  return NextResponse.json({ ok: true, sentAt, platform, result, sendLimit: { ...limit, count: limit.count + 1 } })
}
