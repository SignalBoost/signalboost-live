// saas/app/api/track/route.ts
// Real, first-party click tracking. A campaign's video description (never
// the burned-in on-screen text or spoken narration) links here instead of
// straight to the site. Logs the click to our own database, then redirects
// immediately. Logging is best-effort — a DB hiccup must never block a real
// visitor from reaching the site.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const DESTINATION = 'https://www.saas.signalboostapp.com'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = String(searchParams.get('c') || '').trim()
  const platform = String(searchParams.get('p') || '').trim() || null

  if (campaignId) {
    try {
      const sb = db()
      await sb.from('cos_campaign_clicks').insert({
        campaign_id: campaignId,
        platform,
        referrer: req.headers.get('referer') || null,
        user_agent: req.headers.get('user-agent') || null,
      })
    } catch { /* never block the redirect on a logging failure */ }
  }

  return NextResponse.redirect(DESTINATION, { status: 302 })
}
