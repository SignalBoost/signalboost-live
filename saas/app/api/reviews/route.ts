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


// GET — owner reads their own reviews.
export async function GET() {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'reviews.errors.unauthorized' }, { status: 401 })

  const a = admin()
  const { data, error } = await a
    .from('reviews')
    .select('id, author_name, author_email, rating, content, language, approved, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reviews: data ?? [] })
}


// POST — public submission. No auth. Resolves slug → owner.
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'api.invalidJson' }, { status: 400 }) }

  const slug         = String(body?.slug ?? '').trim().toLowerCase()
  const author_name  = String(body?.author_name ?? '').trim()
  const author_email = String(body?.author_email ?? '').trim().toLowerCase()
  const rating       = Number(body?.rating)
  const content      = String(body?.content ?? '').trim()
  const language     = String(body?.language ?? 'en').trim().toLowerCase().slice(0, 8)

  if (!slug)                                              return NextResponse.json({ error: 'reviews.errors.missingSlug' }, { status: 400 })
  if (author_name.length < 1 || author_name.length > 80)  return NextResponse.json({ error: 'reviews.errors.invalidNameLength' }, { status: 400 })
  if (!isValidEmail(author_email))                        return NextResponse.json({ error: 'reviews.errors.invalidEmail' }, { status: 400 })
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({ error: 'reviews.errors.invalidRating' }, { status: 400 })
  if (content.length < 1 || content.length > 2000)        return NextResponse.json({ error: 'reviews.errors.invalidContentLength' }, { status: 400 })

  const a = admin()

  const { data: profile, error: profileErr } = await a
    .from('profiles')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (profileErr) return NextResponse.json({ error: 'reviews.errors.lookupFailed' }, { status: 500 })
  if (!profile)   return NextResponse.json({ error: 'reviews.errors.notFound' }, { status: 404 })

  const owner_id = profile.id as string
  const ip = getIp(req)

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recentFromIp } = await a
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', owner_id)
    .eq('submitter_ip', ip)
    .gte('created_at', since)

  if ((recentFromIp ?? 0) >= 5) {
    return NextResponse.json({ error: 'reviews.errors.tooManySubmissions' }, { status: 429 })
  }

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
        { error: 'reviews.errors.reviewCapReached' },
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

  if (insertErr) return NextResponse.json({ error: 'reviews.errors.saveFailed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}


// PATCH — owner toggles approved.
export async function PATCH(req: NextRequest) {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'reviews.errors.unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'reviews.errors.missingId' }, { status: 400 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'api.invalidJson' }, { status: 400 }) }
  if (typeof body?.approved !== 'boolean') return NextResponse.json({ error: 'reviews.errors.approvedMustBeBoolean' }, { status: 400 })

  const a = admin()
  const { error } = await a
    .from('reviews')
    .update({ approved: body.approved })
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}


// DELETE — owner deletes a review.
export async function DELETE(req: NextRequest) {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'reviews.errors.unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'reviews.errors.missingId' }, { status: 400 })

  const a = admin()
  const { error } = await a
    .from('reviews')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
