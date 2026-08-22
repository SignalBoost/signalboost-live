import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { MINIMUM_SAMPLES_OVERALL, buildCalibrationCohorts, calibrateAnswerConfidence, thresholdForEscalationRate, type CalibrationCohortSample } from '@/lib/ai/cos/answerConfidenceCalibration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const ROW_LIMIT = 2000

export async function GET(_request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })
  const result = await db.from('cos_turn_experience')
    .select('confidence,confidence_threshold,draft_survived_unrepaired,verified_success,problem_class,reasoner_label,response_source,evidence_summary,created_at')
    .not('confidence', 'is', null).order('created_at', { ascending: false }).limit(ROW_LIMIT)
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 })
  const rows = (result.data ?? []) as Array<Record<string, unknown>>
  let verifiedOutcomes = 0
  let repairSurvivalProxy = 0
  const samples: CalibrationCohortSample[] = rows.flatMap(row => {
    const predicted = Number(row.confidence)
    if (!Number.isFinite(predicted)) return []
    const evidence = row.evidence_summary && typeof row.evidence_summary === 'object' ? row.evidence_summary as Record<string, unknown> : {}
    const evidenceRegime = String(row.response_source || (Object.keys(evidence).length ? 'grounded' : 'ungrounded')).slice(0, 120)
    const cohort = { problemClass: String(row.problem_class || 'general reasoning'), reasonerLabel: String(row.reasoner_label || 'unknown'), evidenceRegime }
    if (typeof row.verified_success === 'boolean') { verifiedOutcomes += 1; return [{ predicted, observed: row.verified_success, ...cohort }] }
    if (typeof row.draft_survived_unrepaired === 'boolean') { repairSurvivalProxy += 1; return [{ predicted, observed: row.draft_survived_unrepaired, ...cohort }] }
    return []
  })
  const predictions = rows.map(row => Number(row.confidence)).filter(Number.isFinite)
  const threshold = Number(rows.find(row => Number.isFinite(Number(row.confidence_threshold)))?.confidence_threshold) || 0.72
  return NextResponse.json({
    ok: true, threshold, report: calibrateAnswerConfidence(samples, threshold),
    cohorts: buildCalibrationCohorts(samples, threshold),
    outcomeSources: { verifiedOutcomes, repairSurvivalProxy, note: repairSurvivalProxy > verifiedOutcomes ? 'Repair-survival is directional only; verified outcomes remain the stronger measure.' : 'Majority of samples carry a verified outcome.' },
    thresholdOptions: {
      toEscalateTenPercent: thresholdForEscalationRate(predictions, 0.1),
      toEscalateTwentyPercent: thresholdForEscalationRate(predictions, 0.2),
      note: `Options only; null below ${MINIMUM_SAMPLES_OVERALL} samples.`,
    },
  })
}
