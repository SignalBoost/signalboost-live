import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const VALID_LOCALES = ['en', 'es', 'pt', 'pl', 'ru']

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

// Return the signed-in user's settings (creating sensible defaults if none yet)
export async function GET() {
  const { supabase, user } = await getClientAndUser()
  if (!user?.id) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const settings = data || {
    user_id: user.id,
    display_name: user.user_metadata?.name || '',
    locale: 'en',
    email_notifications: true,
    product_updates: true,
    timezone: '',
  }

  return NextResponse.json({ settings, email: user.email || '' })
}

// Create or update the user's settings (upsert on user_id)
export async function PATCH(req: NextRequest) {
  const { supabase, user } = await getClientAndUser()
  if (!user?.id) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const row: Record<string, any> = { user_id: user.id }
  if ('display_name' in body) row.display_name = body.display_name ? String(body.display_name).trim().slice(0, 120) : null
  if ('locale' in body) row.locale = VALID_LOCALES.includes(body.locale) ? body.locale : 'en'
  if ('email_notifications' in body) row.email_notifications = !!body.email_notifications
  if ('product_updates' in body) row.product_updates = !!body.product_updates
  if ('timezone' in body) row.timezone = body.timezone ? String(body.timezone).trim().slice(0, 80) : null

  const { data, error } = await supabase
    .from('user_settings')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}
