import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction, enforceRouteRateLimit } from '@/lib/outreach/security'
import { fetchDigitsPartnerBusinesses } from '@/lib/outreach/digits'
import { generateOutreachAssets } from '@/lib/outreach/pipeline'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const limited = await enforceRouteRateLimit({ req, admin: ctx.admin, routeKey: 'digits_sync', limit: 5, windowMinutes: 60 })
  if (limited) return limited

  let body: any = {}
  try { body = await req.json() } catch { body = {} }

  const limit = Math.min(25, Math.max(1, Number(body?.limit || 10)))
  const partners = await fetchDigitsPartnerBusinesses(limit)
  const results: Array<{ partnerId: string; ok: boolean; outreachId?: string; error?: string }> = []

  for (const partner of partners) {
    const existing = await ctx.admin
      .from('outreach_queue')
      .select('id')
      .eq('business_id', partner.id)
      .eq('source_platform', 'digits')
      .maybeSingle()

    if (existing.data?.id) {
      results.push({ partnerId: partner.id, ok: true, outreachId: existing.data.id })
      continue
    }

    try {
      const assets = await generateOutreachAssets({
        sourceUrl: partner.website_url,
        businessName: partner.name,
        sourcePlatform: 'digits',
        language: partner.language || 'en',
        publicText: partner.public_text,
      })

      const { data, error } = await ctx.admin.from('outreach_queue').insert({
        business_id: partner.id,
        source_platform: 'digits',
        business_name: partner.name || assets.analyzer_summary.business_name,
        business_url: partner.website_url,
        analyzer_summary: assets.analyzer_summary,
        business_model_profile: assets.business_model_profile,
        predictive_needs: assets.predictive_needs,
        website_json: assets.website_json,
        review_strategy: assets.review_strategy,
        social_plan: assets.social_plan,
        promo_plan: assets.promo_plan,
        outreach_message: assets.outreach_message,
        status: 'pending',
      }).select('id').single()

      if (error) throw new Error(error.message)
      results.push({ partnerId: partner.id, ok: true, outreachId: data.id })
    } catch (err) {
      results.push({ partnerId: partner.id, ok: false, error: err instanceof Error ? err.message : 'Sync failed' })
      await ctx.admin.from('security_events').insert({
        event_type: 'digits_sync_error',
        severity: 'warning',
        route_key: 'digits_sync',
        metadata: { partnerId: partner.id, error: err instanceof Error ? err.message : 'Sync failed' },
      })
    }
  }

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'digits.sync_outreach',
    targetType: 'digits_partner_businesses',
    metadata: { requested: limit, processed: results.length, failures: results.filter(r => !r.ok).length },
  })

  return NextResponse.json({ ok: true, processed: results.length, results })
}
