import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'

// Service-role client — bypasses RLS for admin operations.
// The user's own rows are still scoped by user_id in every query.
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

// Generate a random 6-character alphanumeric slug.
function randomSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

// Validate that a string looks like an absolute http(s) URL.
function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// Validate a custom slug: 3–32 chars, lowercase letters, digits, hyphens, underscores.
function isValidSlug(s: string): boolean {
  return /^[a-z0-9_-]{3,32}$/.test(s)
}

// ── POST /api/shorten ────────────────────────────────────────────────────────
// Body: { longUrl: string; slug?: string }
// Returns: { id, slug, shortUrl, longUrl, clickCount, createdAt }
export async function POST(req: NextRequest) {
  const access = await getAccess(req)
  if (!access.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { longUrl?: string; slug?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const longUrl = (body.longUrl ?? '').trim()
  if (!longUrl) {
    return NextResponse.json({ error: 'longUrl is required' }, { status: 400 })
  }
  if (!isValidUrl(longUrl)) {
    return NextResponse.json({ error: 'longUrl must be an absolute http(s) URL' }, { status: 400 })
  }

  const db = getServiceClient()
  if (!db) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  // Resolve the slug: use the provided custom slug or generate one.
  let slug = (body.slug ?? '').trim().toLowerCase()
  if (slug) {
    if (!isValidSlug(slug)) {
      return NextResponse.json(
        { error: 'Custom slug must be 3–32 characters: lowercase letters, digits, hyphens, underscores only' },
        { status: 400 },
      )
    }
    // Check uniqueness.
    const { data: existing } = await db
      .from('short_urls')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'That slug is already taken — try another' }, { status: 409 })
    }
  } else {
    // Auto-generate a unique slug (retry up to 5 times on collision).
    let attempts = 0
    while (attempts < 5) {
      const candidate = randomSlug()
      const { data: existing } = await db
        .from('short_urls')
        .select('id')
        .eq('slug', candidate)
        .maybeSingle()
      if (!existing) { slug = candidate; break }
      attempts++
    }
    if (!slug) {
      return NextResponse.json({ error: 'Could not generate a unique slug — please try again' }, { status: 500 })
    }
  }

  const { data, error } = await db
    .from('short_urls')
    .insert({ user_id: access.userId, slug, long_url: longUrl })
    .select('id, slug, long_url, click_count, created_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://saas.signalboostapp.com'
  return NextResponse.json({
    id:         data.id,
    slug:       data.slug,
    shortUrl:   `${baseUrl}/r/${data.slug}`,
    longUrl:    data.long_url,
    clickCount: data.click_count,
    createdAt:  data.created_at,
  }, { status: 201 })
}

// ── GET /api/shorten ─────────────────────────────────────────────────────────
// Returns all short links for the authenticated user, ordered newest first.
export async function GET(req: NextRequest) {
  const access = await getAccess(req)
  if (!access.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()
  if (!db) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { data, error } = await db
    .from('short_urls')
    .select('id, slug, long_url, click_count, created_at')
    .eq('user_id', access.userId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://saas.signalboostapp.com'
  const links = (data ?? []).map(row => ({
    id:         row.id,
    slug:       row.slug,
    shortUrl:   `${baseUrl}/r/${row.slug}`,
    longUrl:    row.long_url,
    clickCount: row.click_count,
    createdAt:  row.created_at,
  }))

  return NextResponse.json({ links })
}

// ── DELETE /api/shorten ──────────────────────────────────────────────────────
// Query param: ?id=<uuid>
// Deletes a link owned by the authenticated user.
export async function DELETE(req: NextRequest) {
  const access = await getAccess(req)
  if (!access.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
  }

  const db = getServiceClient()
  if (!db) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { error } = await db
    .from('short_urls')
    .delete()
    .eq('id', id)
    .eq('user_id', access.userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
