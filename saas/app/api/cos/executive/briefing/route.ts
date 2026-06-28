import { NextResponse } from 'next/server'
import { buildExecutiveBriefing } from '@/lib/cos/executive-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const locale = req.headers.get('x-locale') || new URL(req.url).searchParams.get('locale') || 'en'
  const briefing = buildExecutiveBriefing({ locale })

  return NextResponse.json({ ok: true, briefing })
}
