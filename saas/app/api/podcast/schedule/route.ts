// saas/app/api/podcast/schedule/route.ts
//
// Manages podcast episode scheduling.
// GET  — list all scheduled episodes for the signed-in user
// POST — create a new scheduled episode
// PATCH — update publish_at or title/description for a pending episode
// DELETE — cancel (soft-delete) a scheduled episode

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ── GET — list episodes ──────────────────────────────────────────────────────
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const sb = getServiceClient()
  if (!sb) return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 })

  const { data, error } = await sb
    .from('podcast_schedule')
    .select('*')
    .eq('user_id', user.id)
    .order('publish_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ episodes: data ?? [] })
}

// ── POST — create scheduled episode ─────────────────────────────────────────
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const sb = getServiceClient()
  if (!sb) return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 })

  let body: { title?: string; description?: string; audio_url?: string; publish_at?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  const title = body.title?.trim() || ''
  const publish_at = body.publish_at?.trim() || ''

  if (!title) return NextResponse.json({ error: 'Episode title is required.' }, { status: 400 })
  if (!publish_at) return NextResponse.json({ error: 'Publish date/time is required.' }, { status: 400 })

  const publishDate = new Date(publish_at)
  if (isNaN(publishDate.getTime())) return NextResponse.json({ error: 'Invalid publish date.' }, { status: 400 })
  if (publishDate <= new Date()) return NextResponse.json({ error: 'Publish date must be in the future.' }, { status: 400 })

  const { data, error } = await sb
    .from('podcast_schedule')
    .insert({
      user_id: user.id,
      title,
      description: body.description?.trim() || null,
      audio_url: body.audio_url?.trim() || null,
      publish_at,
      status: 'scheduled',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ episode: data }, { status: 201 })
}

// ── PATCH — update a scheduled episode ──────────────────────────────────────
export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const sb = getServiceClient()
  if (!sb) return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 })

  let body: { id?: string; title?: string; description?: string; audio_url?: string; publish_at?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  if (!body.id) return NextResponse.json({ error: 'Episode id is required.' }, { status: 400 })

  // Verify ownership and that it is still scheduled
  const { data: existing } = await sb
    .from('podcast_schedule')
    .select('id, status')
    .eq('id', body.id)
    .eq('user_id', user.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Episode not found.' }, { status: 404 })
  if (existing.status !== 'scheduled') return NextResponse.json({ error: 'Only scheduled episodes can be edited.' }, { status: 409 })

  const updates: Record<string, string | null> = {}
  if (body.title?.trim()) updates.title = body.title.trim()
  if (typeof body.description === 'string') updates.description = body.description.trim() || null
  if (typeof body.audio_url === 'string') updates.audio_url = body.audio_url.trim() || null
  if (body.publish_at) {
    const d = new Date(body.publish_at)
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid publish date.' }, { status: 400 })
    if (d <= new Date()) return NextResponse.json({ error: 'Publish date must be in the future.' }, { status: 400 })
    updates.publish_at = body.publish_at
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields to update.' }, { status: 400 })

  const { data, error } = await sb
    .from('podcast_schedule')
    .update(updates)
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ episode: data })
}

// ── DELETE — cancel a scheduled episode ─────────────────────────────────────
export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const sb = getServiceClient()
  if (!sb) return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 })

  let body: { id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  if (!body.id) return NextResponse.json({ error: 'Episode id is required.' }, { status: 400 })

  const { data: existing } = await sb
    .from('podcast_schedule')
    .select('id, status')
    .eq('id', body.id)
    .eq('user_id', user.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Episode not found.' }, { status: 404 })
  if (existing.status === 'published') return NextResponse.json({ error: 'Published episodes cannot be cancelled.' }, { status: 409 })

  const { error } = await sb
    .from('podcast_schedule')
    .update({ status: 'cancelled' })
    .eq('id', body.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
