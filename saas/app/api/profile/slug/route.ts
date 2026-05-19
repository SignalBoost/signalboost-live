// saas/app/api/profile/slug/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const RESERVED = new Set([
  'admin', 'administrator', 'api', 'app', 'auth', 'billing', 'dashboard',
  'docs', 'help', 'home', 'login', 'logout', 'me', 'onboarding', 'pricing',
  'privacy', 'profile', 'review', 'reviews', 'root', 'settings', 'signup',
  'signin', 'sign-in', 'sign-up', 'static', 'support', 'team', 'terms',
  'tos', 'user', 'users', 'webhook', 'www', 'signalboost',
])

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$/

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function getAuthedUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )
  const { data: { user } } = await sb.auth.getUser()
  return user
}

export async function GET() {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const a = admin()
  const { data, error } = await a
    .from('profiles')
    .select('slug')
    .eq('id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ slug: data?.slug ?? null })
}

export async function POST(req: NextRequest) {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  const slug = String(body?.slug ?? '').trim().toLowerCase()

  if (!slug)                return NextResponse.json({ error: 'slug required' }, { status: 400 })
  if (!SLUG_RE.test(slug))  return NextResponse.json({ error: '3-30 chars, lowercase letters/digits/hyphens, no edges' }, { status: 400 })
  if (RESERVED.has(slug))   return NextResponse.json({ error: 'this slug is reserved' }, { status: 400 })

  const a = admin()

  const { data: existing, error: lookupErr } = await a
    .from('profiles')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (lookupErr) return NextResponse.json({ error: 'lookup failed' }, { status: 500 })
  if (existing && existing.id !== user.id) {
    return NextResponse.json({ error: 'this slug is already taken' }, { status: 409 })
  }

  const { error: upsertErr } = await a
    .from('profiles')
    .upsert({ id: user.id, slug }, { onConflict: 'id' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, slug })
}
