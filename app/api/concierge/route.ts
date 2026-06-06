import { NextResponse } from 'next/server'
import { answerSignalBoostConcierge } from '@/lib/concierge/unifiedConcierge'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const query = typeof body.query === 'string' ? body.query : ''
  const locale = typeof body.locale === 'string' ? body.locale : 'en'

  return NextResponse.json(answerSignalBoostConcierge(query, locale, { tier: body.tier, usedMinutes: body.usedMinutes, billingProvider: body.billingProvider }))
}

export async function GET() {
  return NextResponse.json(answerSignalBoostConcierge('Show me SignalBoost Marketplace and SaaS modules', 'en'))
}
