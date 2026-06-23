// app/api/concierge/route.ts
// Public concierge advisor. SECURITY: it must NOT trust client-supplied tier /
// usage / billingProvider — a caller could claim any tier and get tier-gated
// guidance. Real export/quota enforcement happens server-side at
// /api/video/export; the concierge stays public but answers at the safe default
// (free/demo) tier only.
import { NextResponse } from 'next/server'
import { answerSignalBoostConcierge } from '@/lib/concierge/unifiedConcierge'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const query = typeof body.query === 'string' ? body.query : ''
  const locale = typeof body.locale === 'string' ? body.locale : 'en'

  // Deliberately ignore body.tier / body.usedMinutes / body.billingProvider.
  return NextResponse.json(answerSignalBoostConcierge(query, locale))
}

export async function GET() {
  return NextResponse.json(answerSignalBoostConcierge('Show me SignalBoost Marketplace and SaaS modules', 'en'))
}
