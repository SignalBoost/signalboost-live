import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { seedCorpusFromCuratedProspects } from '@/lib/business-intelligence-corpus/seed-curated-prospects.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  try {
    const result = await seedCorpusFromCuratedProspects()
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 207 : 200 })
  } catch (error) {
    console.error('business intelligence corpus curated seed failed:', error)
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'CORPUS_CURATED_SEED_FAILED',
    }, { status: 500 })
  }
}
