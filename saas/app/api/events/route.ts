import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

async function getClientAndUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component — safe to ignore
          }
        },
      },
    },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// List the signed-in user's events (optionally within a date range)
export async function GET(req: NextRequest) {
  const { supabase, user } = await getClientAndUser()
  if (!user?.id) return NextResponse.json({ events: [] }, { status: 401 })

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')

  let query = supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', user.id)
    .order('event_date', { ascending: true })

  if (from) query = query.gte('event_date', from)
  if (to) query = query.lte('event_date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ events: [], error: error.message }, { status: 500 })
  return NextResponse.json({ events: data || [] })
}

// Create an event
export async function POST(req: NextRequest) {
  const { supabase, user } = await getClientAndUser()
  if (!user?.id) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const title = String(body?.title || '').trim()
  const eventDate = String(body?.event_date || '').trim()
  const eventType = body?.event_type ? String(body.event_type).trim() : 'general'
  const notes = body?.notes ? String(body.notes).trim() : null

  if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return NextResponse.json({ error: 'A valid date is required.' }, { status: 400 })

  const { data, error } = await supabase
    .from('calendar_events')
    .insert({ user_id: user.id, title, event_date: eventDate, event_type: eventType, notes })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

// Delete an event by id
export async function DELETE(req: NextRequest) {
  const { supabase, user } = await getClientAndUser()
  if (!user?.id) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
