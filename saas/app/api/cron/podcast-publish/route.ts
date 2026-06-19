// saas/app/api/cron/podcast-publish/route.ts
// Vercel Cron — runs every 5 minutes.
// Picks up podcast_schedule rows where scheduled_at <= now AND status = 'pending',
// marks them 'publishing', fires the publish action, then marks 'published' or 'failed'.
// Secured with CRON_SECRET (same pattern as opportunity-scan cron).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type ScheduleRow = {
  id: string
  user_id: string
  episode_id: string | null
  episode_title: string
  scheduled_at: string
  timezone: string
  status: string
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function publishEpisode(row: ScheduleRow): Promise<{ ok: boolean; error?: string }> {
  // ---------------------------------------------------------------------------
  // PUBLISH HOOK
  // Replace the body of this function with your real publish logic:
  //   - Call your podcast host's API (e.g. Buzzsprout, Transistor, RSS.com)
  //   - Or update an RSS feed record in Supabase
  //   - Or trigger a Vercel revalidation for a public RSS route
  //
  // For now we log and succeed so the status machine works end-to-end.
  // ---------------------------------------------------------------------------
  console.log(
    `[podcast-publish] Publishing episode "${row.episode_title}" (id: ${row.episode_id ?? 'n/a'}) for user ${row.user_id}`
  )
  return { ok: true }
}

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'DB unavailable.' }, { status: 500 })
  }

  const now = new Date().toISOString()

  // ── Fetch due rows ────────────────────────────────────────────────────────
  const { data: dueRows, error: fetchError } = await supabase
    .from('podcast_schedule')
    .select('id, user_id, episode_id, episode_title, scheduled_at, timezone, status')
    .eq('status', 'pending')
    .lte('scheduled_at', now)

  if (fetchError) {
    console.error('[podcast-publish] fetch error:', fetchError.message)
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 })
  }

  const rows = (dueRows ?? []) as ScheduleRow[]
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  let published = 0
  let failed = 0

  for (const row of rows) {
    // ── Lock the row: pending → publishing ──────────────────────────────────
    const { error: lockError } = await supabase
      .from('podcast_schedule')
      .update({ status: 'publishing' })
      .eq('id', row.id)
      .eq('status', 'pending') // guard against race conditions

    if (lockError) {
      console.warn(`[podcast-publish] Could not lock row ${row.id}:`, lockError.message)
      continue // another cron instance already picked this up
    }

    // ── Publish ─────────────────────────────────────────────────────────────
    const result = await publishEpisode(row)

    const finalStatus = result.ok ? 'published' : 'failed'
    const { error: updateError } = await supabase
      .from('podcast_schedule')
      .update({
        status: finalStatus,
        ...(result.error ? { error_message: result.error } : {}),
      })
      .eq('id', row.id)

    if (updateError) {
      console.error(`[podcast-publish] Could not update row ${row.id} to ${finalStatus}:`, updateError.message)
    }

    if (result.ok) {
      published++
    } else {
      failed++
      console.error(`[podcast-publish] Failed to publish "${row.episode_title}":`, result.error)
    }
  }

  console.log(`[podcast-publish] done — published: ${published}, failed: ${failed}`)
  return NextResponse.json({ ok: true, processed: rows.length, published, failed })
}
