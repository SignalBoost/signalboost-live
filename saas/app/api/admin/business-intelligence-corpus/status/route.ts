import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { CORPUS_TARGET_RECORDS } from '@/lib/business-intelligence-corpus/contracts.ts'
import { corpusCount } from '@/lib/business-intelligence-corpus/service.ts'
import { getCorpusMetricsSummary } from '@/lib/business-intelligence-corpus/metrics.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const [count, metrics] = await Promise.all([
    corpusCount(),
    getCorpusMetricsSummary().catch(() => null),
  ])
  const remaining = Math.max(0, CORPUS_TARGET_RECORDS - count)
  return NextResponse.json({
    ok: true,
    target: CORPUS_TARGET_RECORDS,
    count,
    remaining,
    completion: CORPUS_TARGET_RECORDS ? Math.min(1, count / CORPUS_TARGET_RECORDS) : 1,
    internalFirst: true,
    providerFallbackPolicy: 'confidence_or_freshness_insufficient_only',
    metrics,
    ready: count >= CORPUS_TARGET_RECORDS,
  })
}
