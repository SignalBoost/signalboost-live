// saas/app/api/admin/test-livefetch/route.ts
// Browser-testable verification for the AI live-data tools.
// Gated by a secret so it is not publicly abusable.
//
// Required env var (Vercel > signalboost-live):
//   LIVEFETCH_TEST_KEY  (any random string you choose)
//
// Test web search (Brave / getExternalInfo):
//   /api/admin/test-livefetch?key=YOUR_SECRET&q=latest+AI+marketing+news
// Test live affiliate count (marketing Supabase):
//   /api/admin/test-livefetch?key=YOUR_SECRET&affiliates=1
// Test both at once:
//   /api/admin/test-livefetch?key=YOUR_SECRET&q=canva+pricing&affiliates=1

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { getExternalInfo, formatExternalInfoForAI } from '@/lib/ai/tools/getExternalInfo'
import { getAffiliateCount, formatAffiliatesForAI } from '@/lib/ai/tools/getAffiliateCount'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const secret = process.env.LIVEFETCH_TEST_KEY
  const key = req.nextUrl.searchParams.get('key')

  if (!secret || key !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  const testAffiliates = req.nextUrl.searchParams.get('affiliates') === '1'

  const out: Record<string, unknown> = {}

  if (q) {
    const started = Date.now()
    const search = await getExternalInfo(q)
    out.webSearch = {
      query: q,
      elapsedMs: Date.now() - started,
      ok: search.ok,
      error: search.error ?? null,
      resultCount: search.results.length,
      formatted: search.ok && search.results.length
        ? formatExternalInfoForAI(q, search.results)
        : 'No live data available.',
      results: search.results,
    }
  }

  if (testAffiliates) {
    const started = Date.now()
    const affiliates = await getAffiliateCount()
    out.affiliateCount = {
      elapsedMs: Date.now() - started,
      ok: affiliates.ok,
      error: affiliates.error ?? null,
      formatted: affiliates.ok && affiliates.metrics
        ? formatAffiliatesForAI(affiliates.metrics)
        : 'No live data available.',
      metrics: affiliates.metrics ?? null,
    }
  }

  if (!q && !testAffiliates) {
    out.hint = 'Add &q=your+search+query to test web search, and/or &affiliates=1 to test the live affiliate count.'
  }

  return NextResponse.json(out)
}
