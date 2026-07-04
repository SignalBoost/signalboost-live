// saas/app/api/track/route.ts
// Real, first-party click tracking. A campaign's video description links here.
// The route logs the click and then redirects the visitor immediately.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

const DESTINATION = 'https://www.saas.signalboostapp.com'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

function h(req: NextRequest, name: string): string | null {
  const value = req.headers.get(name)
  return value ? decodeURIComponent(value).slice(0, 180) : null
}

function ipHash(req: NextRequest): string | null {
  const raw = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || ''
  if (!raw) return null
  return createHash('sha256').update(raw).digest('hex').slice(0, 40)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = String(searchParams.get('c') || '').trim()
  const platform = String(searchParams.get('p') || '').trim() || null

  if (campaignId) {
    try {
      const sb = db()
      const base = {
        campaign_id: campaignId,
        platform,
        referrer: req.headers.get('referer') || null,
        user_agent: req.headers.get('user-agent') || null,
      }

      const enriched = {
        ...base,
        country: h(req, 'x-vercel-ip-country'),
        region: h(req, 'x-vercel-ip-country-region'),
        city: h(req, 'x-vercel-ip-city'),
        latitude: h(req, 'x-vercel-ip-latitude'),
        longitude: h(req, 'x-vercel-ip-longitude'),
        timezone: h(req, 'x-vercel-ip-timezone'),
        ip_hash: ipHash(req),
      }

      const { error } = await sb.from('cos_campaign_clicks').insert(enriched)
      if (error) await sb.from('cos_campaign_clicks').insert(base)
    } catch { /* never block the redirect on a logging failure */ }
  }

  return NextResponse.redirect(DESTINATION, { status: 302 })
}
