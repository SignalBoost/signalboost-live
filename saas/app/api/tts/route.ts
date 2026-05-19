// saas/app/api/reviews/route.ts
//
// Reviews API. Auth pattern matches /api/tts.
//
//   GET    /api/reviews              → owner lists their reviews (auth required)
//   POST   /api/reviews              → public submission via slug (no auth)
//   PATCH  /api/reviews?id=...       → owner toggles approved (auth required)
//   DELETE /api/reviews?id=...       → owner deletes a review (auth required)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const FREE_TIER_REVIEW_CAP = 3

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

function getIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') || ''
  return fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
}

function isValidEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)
}


// ============================================================
// GET — owner reads their own reviews.
// Uses service role + manual user filter (matches TTS pattern).
// ============================================================
export async function GET() {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const a = admin()
  const { data, error } = await a
    .from('reviews')
    .select('id, author_name, author_email, rating, content, language, approved, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reviews: data ?? [] })
}


// ============================================================
// POST — public submission. No auth. Resolves slug → owner.
// ============================================================
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  const slug         = String(body?.slug ?? '').trim().toLowerCase()
  const author_name  = String(body?.author_name ?? '').trim()
  const author_email = String(body?.author_email ?? '').trim().toLowerCase()
  const rating       = Number(body?.rating)
  const content      = String(body?.content ?? '').trim()
  const language     = String(body?.language ?? 'en').trim().toLowerCase().slice(0, 8)

  if (!slug)                                              return NextResponse.json({ error: 'missing slug' }, { status: 400 })
  if (author_name.length < 1 || author_name.length > 80)  return NextResponse.json({ error: 'name must be 1–80 chars' }, { status: 400 })
  if (!isValidEmail(author_email))                        return NextResponse.json({ error: 'invalid email' }, { status: 400 })
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({ error: 'rating must be 1–5' }, { status: 400 })
  if (content.length < 1 || content.length > 2000)        return NextResponse.json({ error: 'content must be 1–2000 chars' }, { status: 400 })

  const a = admin()

  const { data: profile, error: profileErr } = await a
    .from('profiles')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (profileErr) return NextResponse.json({ error: 'lookup failed' }, { status: 500 })
  if (!profile)   return NextResponse.json({ error: 'not found' }, { status: 404 })

  const owner_id = profile.id as string
  const ip = getIp(req)

  // Rate limit: max 5 submissions per IP per owner per day.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recentFromIp } = await a
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', owner_id)
    .eq('submitter_ip', ip)
    .gte('created_at', since)

  if ((recentFromIp ?? 0) >= 5) {
    return NextResponse.json({ error: 'too many submissions, try again tomorrow' }, { status: 429 })
  }

  // Free-tier cap. Matches TTS route convention: only "active" subs are paying.
  const { data: sub } = await a
    .from('subscriptions')
    .select('plan')
    .eq('user_id', owner_id)
    .eq('status', 'active')
    .maybeSingle()

  const plan = (sub?.plan ?? 'trial') as string
  const isPaying = ['starter', 'pro', 'business'].includes(plan.toLowerCase())

  if (!isPaying) {
    const { data: countData } = await a.rpc('count_reviews_for_owner', { p_owner: owner_id })
    const existing = Number(countData ?? 0)
    if (existing >= FREE_TIER_REVIEW_CAP) {
      return NextResponse.json(
        { error: 'this person is not accepting more reviews on their current plan' },
        { status: 403 }
      )
    }
  }

  const { error: insertErr } = await a.from('reviews').insert({
    owner_id,
    author_name,
    author_email,
    rating,
    content,
    language,
    approved: false,
    submitter_ip: ip,
  })

  if (insertErr) return NextResponse.json({ error: 'could not save review' }, { status: 500 })

  return NextResponse.json({ ok: true })
}


// ============================================================
// PATCH — owner toggles approved.
// ============================================================
export async function PATCH(req: NextRequest) {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  if (typeof body?.approved !== 'boolean') return NextResponse.json({ error: 'approved must be boolean' }, { status: 400 })

  const a = admin()
  const { error } = await a
    .from('reviews')
    .update({ approved: body.approved })
    .eq('id', id)
    .eq('owner_id', user.id)  // belt-and-suspenders: can only update own

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}


// ============================================================
// DELETE — owner deletes a review.
// ============================================================
export async function DELETE(req: NextRequest) {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const a = admin()
  const { error } = await a
    .from('reviews')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}// saas/app/api/profile/slug/route.ts
//
// Lets the signed-in user claim or change their public slug.
// Auth pattern matches /api/tts.

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
  if (!SLUG_RE.test(slug))  return NextResponse.json({ error: '3–30 chars, lowercase letters/digits/hyphens, no edges' }, { status: 400 })
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
