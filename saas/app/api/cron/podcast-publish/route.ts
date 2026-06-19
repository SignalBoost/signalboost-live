// saas/app/api/cron/podcast-publish/route.ts
//
// Vercel Cron endpoint — runs every 5 minutes.
// Finds all podcast_schedules rows where:
//   status = 'scheduled'  AND  publish_at <= now()
// Marks each one as 'published' and records published_at.
//
// Configure in vercel.json:
//   { "crons": [{ "path": "/api/cron/podcast-publish", "schedule": "*/5 * * * *" }] }
//
// The route is protected by CRON_SECRET (set as a Vercel env var).
// Vercel injects the secret as the Authorization header on cron invocations.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(req: Request) {
  // Verify cron secret so this endpoint cannot be triggered by arbitrary callers.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }
  }

  const supabase = getServiceClient()
  if (!supabase) {
    console.error('podcast-publish cron: database not configured')
    return NextResponse.json({ error: 'Database not configured.' }, { status: 500 })
  }

  const now = new Date().toISOString()

  // Fetch all due scheduled episodes.
  const { data: due, error: fetchError } = await supabase
    .from('podcast_schedules')
    .select('id, user_id, title')
    .eq('status', 'scheduled')
    .lte('publish_at', now)

  if (fetchError) {
    console.error('podcast-publish cron fetch error:', fetchError)
    return NextResponse.json({ error: 'Could not fetch schedules.' }, { status: 500 })
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, published: 0, message: 'No episodes due.' })
  }

  const ids = due.map((row: { id: string }) => row.id)

  // Mark them all published in one update.
  const { error: updateError } = await supabase
    .from('podcast_schedules')
    .update({ status: 'published', published_at: now })
    .in('id', ids)

  if (updateError) {
    console.error('podcast-publish cron update error:', updateError)
    return NextResponse.json({ error: 'Could not update schedules.' }, { status: 500 })
  }

  console.log(`podcast-publish cron: published ${ids.length} episode(s) at ${now}`)

  return NextResponse.json({
    ok: true,
    published: ids.length,
    episodes: due.map((row: { id: string; title: string }) => ({ id: row.id, title: row.title })),
  })
}
