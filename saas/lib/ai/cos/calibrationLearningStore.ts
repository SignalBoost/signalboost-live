// saas/lib/ai/cos/calibrationLearningStore.ts
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { buildCalibrationCohorts, calibrateAnswerConfidence, type CalibrationCohortSample } from '@/lib/ai/cos/answerConfidenceCalibration'
import { validateCalibrationOnHoldout, type OutcomeSample } from '@/lib/ai/cos/calibrationHoldoutValidation'

const LIMIT = 2000

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function count(value: unknown): number {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0
}

function learnedCorpusWasUsed(evidenceSummary: unknown): boolean {
  const learnedCorpus = asRecord(asRecord(evidenceSummary).learnedCorpus)
  return count(learnedCorpus.injected) > 0 || count(learnedCorpus.cited) > 0
}

/** Classify from observed utilization and route metadata, never from incidental JSON key names. */
export function calibrationEvidenceRegime(args: {
  evidenceSummary: unknown
  routeClass?: unknown
  responseSource?: unknown
}): 'learned_corpus' | 'live_evidence' | 'mixed_evidence' | 'ungrounded_or_unknown' {
  const learned = learnedCorpusWasUsed(args.evidenceSummary)
  const route = `${String(args.routeClass ?? '')} ${String(args.responseSource ?? '')}`.toLowerCase()
  const live = /(?:^|[^a-z])(live|fresh|authoritative)(?:$|[^a-z])/.test(route)
  if (learned && live) return 'mixed_evidence'
  if (learned) return 'learned_corpus'
  if (live) return 'live_evidence'
  return 'ungrounded_or_unknown'
}

/** The outcome table is authoritative; the experience mirror is intentionally best-effort. */
export function authoritativeVerifiedSuccess(row: unknown): boolean | null {
  const value = asRecord(row)
  const relation = value.cos_turn_outcomes
  const outcome = Array.isArray(relation) ? asRecord(relation[0]) : asRecord(relation)
  return typeof outcome.verified_success === 'boolean' ? outcome.verified_success : null
}

export async function readCalibrationLearningReport(limit = LIMIT) {
  const db = cosServiceDb()
  if (!db) return { ok: false as const, error: 'COS service database is not configured.' }

  // Outcome arrival can precede deferred telemetry persistence. Join the authoritative turn outcome,
  // rather than filtering the non-authoritative mirror in cos_turn_experience.
  const result = await db
    .from('cos_turn_experience')
    .select('turn_id,predicted_confidence,problem_class,reasoner_label,route_class,response_source,evidence_summary,created_at,cos_turn_outcomes!inner(verified_success)')
    .not('predicted_confidence', 'is', null)
    .not('cos_turn_outcomes.verified_success', 'is', null)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(LIMIT, Math.floor(limit))))
  if (result.error) return { ok: false as const, error: result.error.message }

  const rows = (result.data || []).flatMap((row: any) => {
    const observed = authoritativeVerifiedSuccess(row)
    if (observed === null) return []
    return [{
      predicted: Number(row.predicted_confidence),
      observed,
      problemClass: row.problem_class,
      reasonerLabel: row.reasoner_label,
      evidenceRegime: calibrationEvidenceRegime(row),
    } as CalibrationCohortSample]
  })

  // Fit on older evidence and prove on newer evidence. This remains observational and cannot change policy.
  const outcomeSamples: OutcomeSample[] = (result.data || []).flatMap((row: any) => {
    const observed = authoritativeVerifiedSuccess(row)
    return observed === null ? [] : [{ predicted: Number(row.predicted_confidence), observed, at: String(row.created_at || '') }]
  })
  const regimeSamples = new Map<string, OutcomeSample[]>()
  for (const row of (result.data || []) as any[]) {
    const observed = authoritativeVerifiedSuccess(row)
    if (observed === null) continue
    const regime = calibrationEvidenceRegime(row)
    const list = regimeSamples.get(regime) ?? []
    list.push({ predicted: Number(row.predicted_confidence), observed, at: String(row.created_at || '') })
    regimeSamples.set(regime, list)
  }

  const holdoutValidation = {
    overall: validateCalibrationOnHoldout(outcomeSamples),
    byEvidenceRegime: Object.fromEntries(
      [...regimeSamples.entries()].sort(([x], [y]) => x.localeCompare(y))
        .map(([regime, list]) => [regime, validateCalibrationOnHoldout(list)]),
    ),
  }
  const overall = calibrateAnswerConfidence(rows)
  return {
    ok: true as const,
    report: {
      samples: rows.length,
      overall,
      cohorts: buildCalibrationCohorts(rows),
      holdoutValidation,
      livePolicyChanged: false,
      note: 'Observational shadow report only. Separate held-out validation and human approval are required before any confidence or escalation policy change.',
    },
  }
}
