// saas/app/api/podcast/schedule/route.ts
// Podcast episode scheduler — list, create, and cancel scheduled episodes.
// Requires a `podcast_schedule` table (see infra PR for migration).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function getUserId(req: NextRequest): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const token =
    req.headers.get('authorization')?.replace('Bearer ', '') ||
    req.cookies.get('sb-access-token')?.value ||
    req.cookies.get('supabase-auth-token')?.value ||
    ''
  if (!token) return null
  const { data } = await supabase.auth.getUser(token)
  return data?.user?.id ?? null
}

// ── GET /api/podcast/schedule ─────────────────────────────────────────────────
// Returns all scheduled episodes for the authenticated user.
export async function GET(req: NextRequest) {
  const supabase = getSupabase()
  if (!supabase) return NextResponse.json({ error: 'DB unavailable.' }, { status: 500 })

  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const { data, error } = await supabase
    .from('podcast_schedule')
    .select('id, episode_title, scheduled_at, timezone, status, created_at')
    .eq('user_id', userId)
    .order('scheduled_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

// ── POST /api/podcast/schedule ────────────────────────────────────────────────
// Body: { episode_title, episode_id?, scheduled_at (ISO string), timezone }
export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  if (!supabase) return NextResponse.json({ error: 'DB unavailable.' }, { status: 500 })

  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  type Body = { episode_title?: string; episode_id?: string; scheduled_at?: string; timezone?: string }
  const body = (await req.json()) as Body
  const { episode_title, episode_id, scheduled_at, timezone } = body

  if (!episode_title?.trim()) {
    return NextResponse.json({ error: 'episode_title is required.' }, { status: 400 })
  }
  if (!scheduled_at) {
    return NextResponse.json({ error: 'scheduled_at is required.' }, { status: 400 })
  }

  const scheduledDate = new Date(scheduled_at)
  if (isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: 'scheduled_at must be a valid ISO date string.' }, { status: 400 })
  }
  if (scheduledDate <= new Date()) {
    return NextResponse.json({ error: 'scheduled_at must be in the future.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('podcast_schedule')
    .insert({
      user_id: userId,
      episode_title: episode_title.trim(),
      episode_id: episode_id ?? null,
      scheduled_at: scheduledDate.toISOString(),
      timezone: timezone ?? 'UTC',
      status: 'pending',
    })
    .select('id, episode_title, scheduled_at, timezone, status, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}

// ── DELETE /api/podcast/schedule ──────────────────────────────────────────────
// Body: { id }  — cancels (deletes) a pending schedule row owned by the user.
export async function DELETE(req: NextRequest) {
  const supabase = getSupabase()
  if (!supabase) return NextResponse.json({ error: 'DB unavailable.' }, { status: 500 })

  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  type Body = { id?: string }
  const body = (await req.json()) as Body
  const { id } = body

  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  // Only allow cancellation of pending rows owned by this user.
  const { error } = await supabase
    .from('podcast_schedule')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'pending')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
