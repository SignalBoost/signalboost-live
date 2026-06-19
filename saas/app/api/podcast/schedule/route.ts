// saas/app/api/podcast/schedule/route.ts
//
// Manages podcast episode schedules.
//
// POST   /api/podcast/schedule  — create a new scheduled episode
// GET    /api/podcast/schedule  — list the caller's scheduled episodes
// DELETE /api/podcast/schedule  — cancel (delete) a scheduled episode by id

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ── POST — schedule a new episode ────────────────────────────────────────────
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'Database not configured.' }, { status: 500 })

  let body: { title?: string; description?: string; audio_url?: string; publish_at?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  const { title, description, audio_url, publish_at } = body

  if (!title?.trim()) return NextResponse.json({ error: 'Episode title is required.' }, { status: 400 })
  if (!publish_at) return NextResponse.json({ error: 'Publish date/time is required.' }, { status: 400 })

  const publishDate = new Date(publish_at)
  if (isNaN(publishDate.getTime())) return NextResponse.json({ error: 'Invalid publish date.' }, { status: 400 })
  if (publishDate <= new Date()) return NextResponse.json({ error: 'Publish time must be in the future.' }, { status: 400 })

  const { data, error } = await supabase
    .from('podcast_schedules')
    .insert({
      user_id: user.id,
      title: title.trim(),
      description: description?.trim() || null,
      audio_url: audio_url?.trim() || null,
      publish_at: publishDate.toISOString(),
      status: 'scheduled',
    })
    .select()
    .single()

  if (error) {
    console.error('podcast/schedule POST error:', error)
    return NextResponse.json({ error: 'Could not save schedule.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, schedule: data })
}

// ── GET — list the caller's schedules ────────────────────────────────────────
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'Database not configured.' }, { status: 500 })

  const { data, error } = await supabase
    .from('podcast_schedules')
    .select('id, title, description, audio_url, publish_at, status, created_at')
    .eq('user_id', user.id)
    .order('publish_at', { ascending: true })

  if (error) {
    console.error('podcast/schedule GET error:', error)
    return NextResponse.json({ error: 'Could not fetch schedules.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, schedules: data ?? [] })
}

// ── DELETE — cancel a scheduled episode ──────────────────────────────────────
export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'Database not configured.' }, { status: 500 })

  let body: { id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  if (!body.id) return NextResponse.json({ error: 'Schedule id is required.' }, { status: 400 })

  // Only allow deleting own schedules that are still pending.
  const { error } = await supabase
    .from('podcast_schedules')
    .delete()
    .eq('id', body.id)
    .eq('user_id', user.id)
    .eq('status', 'scheduled')

  if (error) {
    console.error('podcast/schedule DELETE error:', error)
    return NextResponse.json({ error: 'Could not cancel schedule.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
