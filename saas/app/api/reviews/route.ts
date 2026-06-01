// saas/app/api/reviews/route.ts
//
// Reviews API. Auth pattern matches /api/tts.
//
//   GET    /api/reviews              → owner lists their reviews (auth required)
//   POST   /api/reviews              → public submission via slug (no auth)
//   PATCH  /api/reviews?id=...       → owner updates approval / moderation metadata (auth required)
//   DELETE /api/reviews?id=...       → owner deletes a review (auth required)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'
import { Resend } from 'resend'

const FREE_TIER_REVIEW_CAP = 3
const REVIEW_MEDIA_BUCKET = 'review-media'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

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
      cookieOptions: saasSupabaseCookieOptions,
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


function analyzeSentiment(content: string, rating: number): 'positive' | 'neutral' | 'negative' {
  const text = content.toLowerCase()
  const positive = ['amazing', 'excellent', 'great', 'love', 'happy', 'fast', 'ótimo', 'excelente', 'clara', 'świetny', 'хорош', 'отлич'].filter(word => text.includes(word)).length
  const negative = ['bad', 'slow', 'terrible', 'spam', 'fraud', 'lento', 'ruim', 'malo', 'wolno', 'медленно', 'плохо'].filter(word => text.includes(word)).length
  const score = positive - negative + (rating >= 4 ? 1 : rating <= 2 ? -1 : 0)
  if (score > 0) return 'positive'
  if (score < 0) return 'negative'
  return 'neutral'
}

function containsModerationFlag(content: string): boolean {
  const text = content.toLowerCase()
  return ['spam', 'fraud', 'hate', 'abuse', 'inappropriate', 'scam', 'violent'].some(word => text.includes(word))
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = dataUrl.match(/^data:(image\/[^;]+|video\/[^;]+);base64,(.+)$/)
  if (!match) return null
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') }
}

async function uploadReviewMedia(a: ReturnType<typeof admin>, ownerId: string, mediaDataUrls: unknown): Promise<string[]> {
  if (!Array.isArray(mediaDataUrls)) return []
  const uploaded: string[] = []
  for (const [index, raw] of mediaDataUrls.slice(0, 4).entries()) {
    const parsed = typeof raw === 'string' ? parseDataUrl(raw) : null
    if (!parsed || parsed.buffer.byteLength > 8 * 1024 * 1024) continue
    const ext = parsed.mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin'
    const path = `${ownerId}/${Date.now()}-${index}.${ext}`
    const { error } = await a.storage.from(REVIEW_MEDIA_BUCKET).upload(path, parsed.buffer, { contentType: parsed.mime, upsert: false })
    if (!error) {
      const { data } = a.storage.from(REVIEW_MEDIA_BUCKET).getPublicUrl(path)
      if (data.publicUrl) uploaded.push(data.publicUrl)
    }
  }
  return uploaded
}

async function notifyOwner(ownerId: string, review: { author_name: string; rating: number; sentiment: string; content: string }) {
  if (!resend) return
  const { data } = await admin().from('profiles').select('email').eq('id', ownerId).maybeSingle()
  const to = data?.email || process.env.REVIEW_NOTIFICATION_EMAIL
  if (!to) return
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'SignalBoost Reviews <reviews@signalboostapp.com>',
    to,
    subject: `New ${review.sentiment} ${review.rating}-star review from ${review.author_name}`,
    text: `${review.author_name} left a ${review.rating}-star review. Routing: ${review.sentiment === 'positive' ? 'public approval queue' : 'private follow-up queue'}.\n\n${review.content}`,
  })
}

async function notifySmsWebhook(ownerId: string, review: { author_name: string; rating: number; sentiment: string }) {
  if (!process.env.REVIEW_SMS_WEBHOOK_URL) return
  await fetch(process.env.REVIEW_SMS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId, type: 'review.created', review }),
  }).catch(() => undefined)
}


// GET — owner reads their own reviews.
export async function GET() {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'reviews.errors.unauthorized' }, { status: 401 })

  const a = admin()
  const { data, error } = await a
    .from('reviews')
    .select('id, author_name, author_email, rating, content, language, approved, created_at, sentiment, verified_partner, partner_name, product_name, service_name, media_urls, flagged, moderation_status')
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
  const provided_media_urls = Array.isArray(body?.media_urls)
    ? body.media_urls.map((url: unknown) => String(url).trim()).filter((url: string) => /^https:\/\//.test(url)).slice(0, 4)
    : []
  const partner_name = body?.partner_name ? String(body.partner_name).trim().slice(0, 120) : null
  const product_name = body?.product_name ? String(body.product_name).trim().slice(0, 120) : null
  const service_name = body?.service_name ? String(body.service_name).trim().slice(0, 120) : null
  const verified_partner = Boolean(body?.verified_partner)

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

  const sentiment = analyzeSentiment(content, rating)
  const flagged = containsModerationFlag(content)
  const uploadedMediaUrls = await uploadReviewMedia(a, owner_id, body?.media_data_urls)
  const media_urls = [...provided_media_urls, ...uploadedMediaUrls].slice(0, 4)
  const approved = sentiment === 'positive' && !flagged
  const moderation_status = flagged ? 'flagged' : approved ? 'approved' : 'pending'

  const { error: insertErr } = await a.from('reviews').insert({
    owner_id,
    author_name,
    author_email,
    rating,
    content,
    language,
    approved,
    submitter_ip: ip,
    media_urls,
    partner_name,
    product_name,
    service_name,
    verified_partner,
    sentiment,
    flagged,
    moderation_status,
    public_destination: approved ? 'public' : 'private',
  })

  if (insertErr) return NextResponse.json({ error: 'reviews.errors.saveFailed' }, { status: 500 })

  await Promise.all([
    notifyOwner(owner_id, { author_name, rating, sentiment, content }),
    notifySmsWebhook(owner_id, { author_name, rating, sentiment }),
  ]).catch(() => undefined)

  return NextResponse.json({ ok: true, routing: approved ? 'public' : 'private', sentiment })
}


// PATCH — owner updates approval and moderation metadata.
export async function PATCH(req: NextRequest) {
  const user = await getAuthedUser()
  if (!user) return NextResponse.json({ error: 'reviews.errors.unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'reviews.errors.missingId' }, { status: 400 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'api.invalidJson' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (typeof body?.approved === 'boolean') patch.approved = body.approved
  if (typeof body?.flagged === 'boolean') patch.flagged = body.flagged
  if (['pending', 'approved', 'rejected', 'flagged'].includes(body?.moderation_status)) patch.moderation_status = body.moderation_status
  if (['positive', 'neutral', 'negative'].includes(body?.sentiment)) patch.sentiment = body.sentiment

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'reviews.errors.emptyPatch' }, { status: 400 })
  }

  const a = admin()
  const { error } = await a
    .from('reviews')
    .update(patch)
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
