// saas/app/api/admin/outreach/news-ads/prepare/route.ts
// Owner/admin-gated preparation endpoint for digital free-newspaper ads.
// This generates reviewable ad packages only. It does not post to third-party sites.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { buildDigitalNewspaperAdPackage } from '@/lib/outreach/digitalNewspaperAds'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = {}
  try { body = await req.json() } catch { body = {} }

  const adPackage = buildDigitalNewspaperAdPackage({
    productName: body?.productName,
    offer: body?.offer,
    audience: body?.audience,
    region: body?.region,
    language: body?.language,
    landingUrl: body?.landingUrl,
    adFormat: body?.adFormat,
    targetNames: Array.isArray(body?.targetNames) ? body.targetNames : [],
  })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'outreach.digital_newspaper_ads.prepare',
    targetType: 'digital_newspaper_ads',
    targetId: adPackage.input.productName,
    metadata: {
      region: adPackage.input.region,
      language: adPackage.input.language,
      targetCount: adPackage.targets.length,
      autoPostEnabled: false,
    },
  })

  return NextResponse.json({ ok: true, adPackage })
}

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const adPackage = buildDigitalNewspaperAdPackage()
  return NextResponse.json({
    ok: true,
    mode: 'preview',
    message: 'POST to this endpoint with productName, offer, audience, region, language, landingUrl, adFormat, and targetNames to prepare a newspaper/classified ad package. This endpoint does not post ads.',
    adPackage,
  })
}
