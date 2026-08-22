import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { DEFAULT_LOOKBACK_DAYS, readKnowledgeApplicationReport, runKnowledgeApplicationScan } from '@/lib/ai/cos/knowledgeApplicationStore'
import { MAX_REOPEN_PER_CYCLE, MINIMUM_COVERAGE, MINIMUM_MATCHED_TERMS, MINIMUM_SOURCE_CONFIDENCE, REOPEN_LIMIT } from '@/lib/ai/cos/knowledgeApplicationScan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOTE = 'A reopen is a requeue, not an answer. Reopened questions return to the normal governed study path and must earn resolution there. Lexical overlap is a retest trigger, not a relevance claim.'
const THRESHOLDS = { lookbackDays: DEFAULT_LOOKBACK_DAYS, minimumMatchedTerms: MINIMUM_MATCHED_TERMS, minimumCoverage: MINIMUM_COVERAGE, minimumSourceConfidence: MINIMUM_SOURCE_CONFIDENCE, reopenLimitPerGap: REOPEN_LIMIT, maxReopenPerCycle: MAX_REOPEN_PER_CYCLE }

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const report = await readKnowledgeApplicationReport()
  return NextResponse.json({ ...report, thresholds: THRESHOLDS, note: NOTE }, { status: report.ok ? 200 : 503 })
}

export async function POST(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const dryRun = request.nextUrl.searchParams.get('dry') === '1'
  const requestedLookback = Number(request.nextUrl.searchParams.get('lookbackDays'))
  const summary = await runKnowledgeApplicationScan({ dryRun, lookbackDays: Number.isFinite(requestedLookback) && requestedLookback > 0 ? requestedLookback : undefined })
  return NextResponse.json({ ok: summary.enabled, dryRun, summary, thresholds: THRESHOLDS, note: NOTE })
}
