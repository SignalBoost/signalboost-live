import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS so the redirect works for any visitor,
// not just the link owner. The click increment is a write-only operation on a
// known row; no user data is exposed.
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const slug = (params.slug ?? '').trim().toLowerCase()

  if (!slug) {
    return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL ?? 'https://saas.signalboostapp.com'))
  }

  const db = getServiceClient()
  if (!db) {
    // Service client unavailable — redirect home rather than showing an error.
    return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL ?? 'https://saas.signalboostapp.com'))
  }

  // Look up the slug.
  const { data, error } = await db
    .from('short_urls')
    .select('id, long_url')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) {
    // Slug not found — send to a friendly not-found page.
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://saas.signalboostapp.com'
    return NextResponse.redirect(new URL('/not-found', base), { status: 302 })
  }

  // Increment click_count asynchronously — fire and forget so the redirect
  // is not delayed by the write. The increment uses a Postgres RPC to avoid
  // a read-modify-write race condition.
  db.rpc('increment_short_url_clicks', { row_id: data.id }).then(() => {}).catch(() => {})

  // 307 Temporary Redirect preserves the HTTP method and keeps the short URL
  // "alive" in the browser history, which is correct for a link shortener.
  return NextResponse.redirect(data.long_url, { status: 307 })
}
