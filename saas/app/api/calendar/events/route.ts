// saas/app/api/calendar/events/route.ts
// Backend for /dashboard/calendar. Contract matches the existing page exactly:
//   GET    /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD -> { events: CalEvent[] }
//   POST   /api/calendar/events  { title, event_date, notes? }  -> { event: CalEvent }
//   DELETE /api/calendar/events?id=<uuid>                       -> { ok: true }
// Per-user, cookie-authed (same pattern as /api/reviews). RLS also enforces
// per-user isolation at the database.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

async function getAuthedClient() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  )
  const { data: { user } } = await sb.auth.getUser()
  return { sb, user }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const { sb, user } = await getAuthedClient()
  if (!user) return NextResponse.json({ error: 'Sign in to view your calendar.' }, { status: 401 })

  const from = req.nextUrl.searchParams.get('from') || ''
  const to = req.nextUrl.searchParams.get('to') || ''

  let query = sb
    .from('calendar_events')
    .select('id, title, event_date, event_type, notes')
    .eq('user_id', user.id)
    .order('event_date', { ascending: true })

  if (DATE_RE.test(from)) query = query.gte('event_date', from)
  if (DATE_RE.test(to)) query = query.lte('event_date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data || [] })
}

export async function POST(req: NextRequest) {
  const { sb, user } = await getAuthedClient()
  if (!user) return NextResponse.json({ error: 'Sign in to add events.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const title = String(body?.title || '').trim().slice(0, 200)
  const eventDate = String(body?.event_date || '').trim()
  const notes = String(body?.notes || '').trim().slice(0, 2000)
  const eventType = String(body?.event_type || 'custom').trim().slice(0, 40) || 'custom'

  if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 })
  if (!DATE_RE.test(eventDate)) return NextResponse.json({ error: 'A valid date is required.' }, { status: 400 })

  const { data, error } = await sb
    .from('calendar_events')
    .insert({ user_id: user.id, title, event_date: eventDate, notes, event_type: eventType })
    .select('id, title, event_date, event_type, notes')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

export async function DELETE(req: NextRequest) {
  const { sb, user } = await getAuthedClient()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'Missing event id.' }, { status: 400 })

  const { error } = await sb.from('calendar_events').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
