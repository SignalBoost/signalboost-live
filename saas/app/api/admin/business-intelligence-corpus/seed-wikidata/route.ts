import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { seedCorpusFromWikidataPublic } from '@/lib/business-intelligence-corpus/wikidata-public.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  try {
    const body = await req.json().catch(() => ({})) as { apply?: boolean; limit?: number; offset?: number }
    const result = await seedCorpusFromWikidataPublic({
      apply: body.apply === true,
      limit: body.limit,
      offset: body.offset,
    })
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 207 : 200 })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error || '')
    console.error('business intelligence corpus Wikidata seed failed:', error)
    return NextResponse.json({
      ok: false,
      error: detail || 'CORPUS_WIKIDATA_SEED_FAILED',
      providerCalls: 0,
      externalAiCalls: 0,
    }, { status: 500 })
  }
}
