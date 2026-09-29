import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { getLearnedCorpusEmbeddingStats } from '@/lib/ai/cos/learnedCorpusSemantic'
import { readEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error, authRequired: guard.status === 401 }, { status: guard.status })

  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service store is unavailable.' }, { status: 503 })

  const [stats, telemetryResult, evidence] = await Promise.all([
    getLearnedCorpusEmbeddingStats(),
    db.from('cos_learning_indexer_telemetry').select('*').eq('id', 'continuous_indexer').maybeSingle(),
    readEvidenceSourceUse(250),
  ])

  const telemetry = telemetryResult.error ? null : telemetryResult.data
  const evidenceReport = 'report' in evidence ? evidence.report : null
  const university = evidenceReport?.bySourceKind?.find((entry: any) => entry.sourceKind === 'university_distillation_asset') ?? null

  return NextResponse.json({
    ok: true,
    automaticIndexer: telemetry ? {
      status: telemetry.status,
      lastStartedAt: telemetry.last_started_at,
      lastCompletedAt: telemetry.last_completed_at,
      attempted: telemetry.attempted,
      embedded: telemetry.embedded,
      failed: telemetry.failed,
      pendingBefore: telemetry.pending_before,
      pendingAfter: telemetry.pending_after,
      durationMs: telemetry.duration_ms,
      error: telemetry.error,
      cadenceMinutes: 5,
    } : null,
    embeddings: stats,
    learnedEvidenceUse: evidenceReport ? {
      turns: evidenceReport.turns,
      totalInjected: evidenceReport.totalInjected,
      totalCited: evidenceReport.totalCited,
      zeroCitationTurns: evidenceReport.zeroCitationTurns,
      overallCitedRate: evidenceReport.overallCitedRate,
      summary: evidenceReport.summary,
      university,
    } : null,
  })
}
