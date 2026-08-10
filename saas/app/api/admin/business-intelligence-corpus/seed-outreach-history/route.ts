import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { seedCorpusFromExistingOutreachHistory } from '@/lib/business-intelligence-corpus/outreach-history.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  try {
    const result = await seedCorpusFromExistingOutreachHistory()
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 207 : 200 })
  } catch (error) {
    console.error('business intelligence corpus outreach-history seed failed:', error)
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'CORPUS_OUTREACH_HISTORY_SEED_FAILED',
    }, { status: 500 })
  }
}
