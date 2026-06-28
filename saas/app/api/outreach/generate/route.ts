// saas/app/api/outreach/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, enforceRouteRateLimit, auditAdminAction } from '@/lib/outreach/security'
import { generateOutreachAssets } from '@/lib/outreach/pipeline'
import { findContactEmail } from '@/lib/outreach/emailFinder'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const limited = await enforceRouteRateLimit({ req, admin: ctx.admin, routeKey: 'outreach_generate', limit: 20, windowMinutes: 60 })
  if (limited) return limited

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const sourceUrl = String(body?.business_url || body?.sourceUrl || '').trim()
  const businessName = body?.business_name ? String(body.business_name).trim() : undefined
  const sourcePlatform = body?.source_platform ? String(body.source_platform).trim() : 'manual'
  const language = body?.language ? String(body.language).trim() : 'en'
  const publicText = body?.public_text ? String(body.public_text) : undefined

  if (!sourceUrl) return NextResponse.json({ error: 'business_url is required' }, { status: 400 })

  const assets = await generateOutreachAssets({ sourceUrl, businessName, sourcePlatform, language, publicText })

  // Find a real, published contact email on the target's site. For the owner's
  // manual generate flow we still create the draft if none is found (the owner
  // can supply one), but the send route refuses to send without a real address.
  const found = await findContactEmail(sourceUrl)

  const { data, error } = await ctx.admin
    .from('outreach_queue')
    .insert({
      business_id: body?.business_id ? String(body.business_id) : null,
      source_platform: sourcePlatform,
      business_name: businessName || assets.analyzer_summary.business_name,
      business_url: sourceUrl,
      contact_email: found.email,
      analyzer_summary: assets.analyzer_summary,
      business_model_profile: assets.business_model_profile,
      predictive_needs: assets.predictive_needs,
      website_json: assets.website_json,
      review_strategy: assets.review_strategy,
      social_plan: assets.social_plan,
      promo_plan: assets.promo_plan,
      outreach_message: assets.outreach_message,
      status: 'pending',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'outreach.generate_and_queue',
    targetType: 'outreach_queue',
    targetId: data.id,
    metadata: { sourcePlatform, businessName: data.business_name, contactEmailFound: !!found.email },
  })

  return NextResponse.json({ ok: true, outreach: data, contactEmailFound: !!found.email })
}
