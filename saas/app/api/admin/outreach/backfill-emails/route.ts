// saas/app/api/admin/outreach/backfill-emails/route.ts
// Owner-gated. Re-runs email discovery (site scrape + Apollo fallback) on every
// approved draft that has no contact_email. Processes up to `limit` rows per call
// (default 20) to stay inside the Vercel 60s timeout; call again until done=true.
// Reports how many were recovered vs still null.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { findContactEmail } from '@/lib/outreach/emailFinder'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50)

  // Fetch a batch of approved drafts with no email
  const { data: rows, error } = await ctx.admin
    .from('outreach_queue')
    .select('id, business_name, business_url')
    .eq('status', 'approved')
    .is('contact_email', null)
    .limit(limit)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) return NextResponse.json({ ok: true, done: true, recovered: 0, stillNull: 0, results: [] })

  const results: Array<{ id: string; name: string; email: string | null; source: string | null }> = []
  let recovered = 0

  for (const row of rows) {
    const found = await findContactEmail(row.business_url || '').catch(() => ({ email: null, source: null, candidates: [] }))
    if (found.email) {
      await ctx.admin.from('outreach_queue').update({ contact_email: found.email }).eq('id', row.id)
      recovered++
    }
    results.push({ id: row.id, name: row.business_name, email: found.email, source: found.source })
  }

  // Check if more remain
  const { count } = await ctx.admin
    .from('outreach_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .is('contact_email', null)

  return NextResponse.json({
    ok: true,
    done: (count || 0) === 0,
    processed: rows.length,
    recovered,
    stillNull: rows.length - recovered,
    remaining: count || 0,
    results,
  })
}
