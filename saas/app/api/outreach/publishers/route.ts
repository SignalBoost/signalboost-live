// saas/app/api/outreach/publishers/route.ts
//
// REGIONAL PUBLISHER SEARCH — IT magazines, newspapers and news portals by country.
//
// lib/marketing/publisherDiscovery.ts has always known how to find a publication and
// dig out its editor's address, but nothing in the app called it and its queries were
// English-only. It is now region-aware, and this route is the way in: give it a country
// and it returns outlets in that country's own language with a real editorial contact.
//
// Read-only and owner-gated. It queues nothing and sends nothing — the results are for
// the operator to review, and anything worth pursuing goes through the normal draft →
// approve → send path like any other outreach.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { discoverPublishers } from '@/lib/marketing/publisherDiscovery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Each candidate costs several page fetches; the search budget below stays under this.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { body = {} }

  const region = body?.region ? String(body.region).trim() : ''
  const brief = String(body?.brief || '').trim()
  // 'trade' biases toward industry magazines (revista/czasopismo/журнал), 'print'
  // toward newspapers. Anything else searches the full mix for the country.
  const channel = String(body?.channel || 'digital_press').trim()
  const limit = Number(body?.limit) || 10

  if (!region) return NextResponse.json({ error: 'region is required, e.g. "Brazil" or "Poland".' }, { status: 400 })

  const result = await discoverPublishers({ brief, channel, region, limit, budgetMs: 200_000 })
  if (!result.ok) {
    return NextResponse.json({ ok: false, region, examined: result.examined, error: result.error }, { status: 200 })
  }

  return NextResponse.json({
    ok: true,
    region,
    examined: result.examined,
    count: result.publishers.length,
    publishers: result.publishers.map(publisher => ({
      publication: publisher.publicationName,
      contact: publisher.editorContact,
      method: publisher.method,
      source: publisher.sourceUrl,
    })),
  })
}
