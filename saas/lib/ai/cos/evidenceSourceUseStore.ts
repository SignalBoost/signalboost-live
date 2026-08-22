// saas/lib/ai/cos/evidenceSourceUseStore.ts
//
// Reliable persistence and outcome-aware rollup for learned-corpus source-kind utilization.
// This measurement must never become an answer dependency.

import { after } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  attributeSourceKinds,
  rollupSourceKindUse,
  type EvidenceUse,
  type SourceKindRollup,
} from '@/lib/ai/cos/evidenceSourceUse'
import {
  consumeDetailedEvidenceSourceUseTurn,
  type CapturedLearnedRetrievalItem,
} from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import type { AdaptiveRetrievalShadowPolicy } from '@/lib/ai/cos/adaptiveRetrievalContext'
import { persistRetrievalSelfReflection } from '@/lib/ai/cos/retrievalSelfReflectionStore'

const ROLLUP_ROW_LIMIT = 1000
const OUTCOME_BATCH_SIZE = 200

export type LearnedRetrievalItemUse = CapturedLearnedRetrievalItem & {
  index: number
  cited: boolean
}

export type EvidenceSourceUseInput = {
  turnId: string
  use: EvidenceUse
  items?: LearnedRetrievalItemUse[]
  retrievalPolicy?: AdaptiveRetrievalShadowPolicy | null
}

async function persistEvidenceSourceUse(input: EvidenceSourceUseInput): Promise<void> {
  try {
    if (!input?.turnId || !input.use || input.use.injected <= 0) return
    const db = cosServiceDb()
    if (!db) return
    const result = await db.from('cos_evidence_source_use').upsert({
      turn_id: input.turnId,
      evidence_system: 'learned_corpus',
      injected: input.use.injected,
      cited: input.use.cited,
      by_source_kind: input.use.bySourceKind,
      items: Array.isArray(input.items) ? input.items : [],
      retrieval_policy: input.retrievalPolicy && typeof input.retrievalPolicy === 'object' ? input.retrievalPolicy : {},
    }, { onConflict: 'turn_id,evidence_system' })
    if (result.error) throw result.error
    await persistRetrievalSelfReflection({
      turnId: input.turnId,
      injected: input.use.injected,
      cited: input.use.cited,
      items: Array.isArray(input.items) ? input.items : [],
    })
  } catch (error) {
    console.warn('[cos-evidence-source-use] record failed (non-fatal):', error instanceof Error ? error.message : String(error))
  }
}

export function recordEvidenceSourceUse(input: EvidenceSourceUseInput): void {
  if (!input?.turnId || !input.use || input.use.injected <= 0) return
  try {
    after(() => persistEvidenceSourceUse(input))
  } catch {
    void persistEvidenceSourceUse(input)
  }
}

/** Existing public source-use snapshot stays stable; only persistence consumes the detailed form. */
export function flushCapturedEvidenceSourceUse(): void {
  const captured = consumeDetailedEvidenceSourceUseTurn()
  if (!captured) return
  const citedIndices = new Set(captured.citedIndices)
  recordEvidenceSourceUse({
    turnId: captured.turnId,
    use: attributeSourceKinds(captured.sourceKinds, captured.citedIndices),
    items: captured.items.map((item, offset) => ({
      ...item,
      index: offset + 1,
      cited: citedIndices.has(offset + 1),
    })),
    retrievalPolicy: captured.retrievalPolicy,
  })
}

type TurnOutcomeSnapshot = {
  turn_id?: string | null
  repair_needed?: boolean | null
  escalated?: boolean | null
  user_feedback?: string | null
  verified_success?: boolean | null
  outcome_at?: string | null
  outcome_source?: string | null
}

export type SourceKindOutcomeCorrelation = {
  sourceKind: string
  turnsInjected: number
  outcomeObservedTurns: number
  verifiedSuccessTurns: number
  repairNeededTurns: number
  escalatedTurns: number
  positiveFeedbackTurns: number
  negativeFeedbackTurns: number
  correctionFeedbackTurns: number
}

export type EvidenceSourceUseReport = {
  evidenceSystem: 'learned_corpus'
  turns: number
  totalInjected: number
  totalCited: number
  zeroCitationTurns: number
  overallCitedRate: number | null
  outcomeCoverage: { observedTurns: number; rate: number | null }
  itemTelemetry: {
    items: number
    withSimilarity: number
    citedItems: number
    unusedItems: number
    avgSimilarity: number | null
    citedAvgSimilarity: number | null
    unusedAvgSimilarity: number | null
    shadowTurns: number
  }
  bySourceKind: Array<SourceKindRollup & { outcomes: SourceKindOutcomeCorrelation }>
  summary: string
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size) as T[])
  return out
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))
}

async function loadOutcomes(turnIds: string[]): Promise<Map<string, TurnOutcomeSnapshot>> {
  const db = cosServiceDb()
  const map = new Map<string, TurnOutcomeSnapshot>()
  if (!db || turnIds.length === 0) return map
  for (const batch of chunk([...new Set(turnIds)], OUTCOME_BATCH_SIZE)) {
    const result = await db
      .from('cos_turn_outcomes')
      .select('turn_id,repair_needed,escalated,user_feedback,verified_success,outcome_at,outcome_source')
      .in('turn_id', batch)
    if (result.error) {
      console.warn('[cos-evidence-source-use] outcome join failed (non-fatal):', result.error.message)
      continue
    }
    for (const row of (result.data ?? []) as TurnOutcomeSnapshot[]) if (row.turn_id) map.set(row.turn_id, row)
  }
  return map
}

export async function readEvidenceSourceUse(limit = ROLLUP_ROW_LIMIT): Promise<{ ok: true; report: EvidenceSourceUseReport } | { ok: false; error: string }> {
  const db = cosServiceDb()
  if (!db) return { ok: false, error: 'COS service database is not configured.' }

  const result = await db
    .from('cos_evidence_source_use')
    .select('turn_id,injected,cited,by_source_kind,items,retrieval_policy,created_at')
    .eq('evidence_system', 'learned_corpus')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(ROLLUP_ROW_LIMIT, Math.floor(limit))))
  if (result.error) return { ok: false, error: `cos_evidence_source_use read failed: ${result.error.message}` }

  type Row = { turn_id?: string; injected?: number; cited?: number; by_source_kind?: unknown; items?: unknown; retrieval_policy?: unknown }
  const rows = (result.data ?? []) as Row[]
  const uses: EvidenceUse[] = rows.map(row => ({
    injected: Number(row.injected) || 0,
    cited: Number(row.cited) || 0,
    bySourceKind: Array.isArray(row.by_source_kind) ? row.by_source_kind as EvidenceUse['bySourceKind'] : [],
  }))

  const outcomes = await loadOutcomes(rows.map(row => String(row.turn_id || '')).filter(Boolean))
  const totalInjected = uses.reduce((sum, use) => sum + use.injected, 0)
  const totalCited = uses.reduce((sum, use) => sum + use.cited, 0)
  const zeroCitationTurns = uses.filter(use => use.injected > 0 && use.cited === 0).length
  const rollup = rollupSourceKindUse(uses)

  const itemRows = rows.flatMap(row => Array.isArray(row.items) ? row.items as Array<Record<string, unknown>> : [])
  const similarities = itemRows.map(item => item.similarity == null ? null : Number(item.similarity)).filter((value): value is number => value != null && Number.isFinite(value))
  const citedSimilarities = itemRows.filter(item => item.cited === true).map(item => item.similarity == null ? null : Number(item.similarity)).filter((value): value is number => value != null && Number.isFinite(value))
  const unusedSimilarities = itemRows.filter(item => item.cited !== true).map(item => item.similarity == null ? null : Number(item.similarity)).filter((value): value is number => value != null && Number.isFinite(value))
  const shadowTurns = rows.filter(row => Boolean(row.retrieval_policy && typeof row.retrieval_policy === 'object' && Object.keys(row.retrieval_policy as Record<string, unknown>).length > 0)).length

  const bySourceKind = rollup.map(entry => {
    const turnIds = new Set<string>()
    rows.forEach((row, index) => {
      if (uses[index]?.bySourceKind.some(kind => kind.sourceKind === entry.sourceKind && kind.injected > 0) && row.turn_id) turnIds.add(row.turn_id)
    })
    let outcomeObservedTurns = 0
    let verifiedSuccessTurns = 0
    let repairNeededTurns = 0
    let escalatedTurns = 0
    let positiveFeedbackTurns = 0
    let negativeFeedbackTurns = 0
    let correctionFeedbackTurns = 0
    for (const turnId of turnIds) {
      const outcome = outcomes.get(turnId)
      if (!outcome?.outcome_at) continue
      outcomeObservedTurns += 1
      if (outcome.verified_success === true) verifiedSuccessTurns += 1
      if (outcome.repair_needed === true) repairNeededTurns += 1
      if (outcome.escalated === true) escalatedTurns += 1
      if (outcome.user_feedback === 'positive') positiveFeedbackTurns += 1
      if (outcome.user_feedback === 'negative') negativeFeedbackTurns += 1
      if (outcome.user_feedback === 'correction') correctionFeedbackTurns += 1
    }
    return { ...entry, outcomes:{ sourceKind:entry.sourceKind, turnsInjected:turnIds.size, outcomeObservedTurns, verifiedSuccessTurns, repairNeededTurns, escalatedTurns, positiveFeedbackTurns, negativeFeedbackTurns, correctionFeedbackTurns } }
  })

  const observedTurns = rows.reduce((sum, row) => sum + (row.turn_id && outcomes.get(row.turn_id)?.outcome_at ? 1 : 0), 0)
  const lowValue = bySourceKind.filter(entry => entry.verdict === 'never_cited' || entry.verdict === 'low_utilization')
  const summary = uses.length === 0
    ? 'No learned-corpus evidence has been injected since source-use measurement started.'
    : totalCited === 0
      ? `NONE of ${totalInjected} injected learned-corpus items across ${uses.length} turns was cited. This is a utilization finding, not proof that the citation detector is broken.`
      : lowValue.length > 0
        ? `${Math.round((totalCited / totalInjected) * 100)}% of injected learned-corpus evidence was cited. ${lowValue.length} source kind(s) are currently never-cited or low-utilization after the minimum sample gate.`
        : `${Math.round((totalCited / totalInjected) * 100)}% of injected learned-corpus evidence was cited across ${uses.length} turns.`

  return { ok:true, report:{
    evidenceSystem:'learned_corpus', turns:uses.length, totalInjected, totalCited, zeroCitationTurns,
    overallCitedRate: totalInjected > 0 ? Number((totalCited / totalInjected).toFixed(4)) : null,
    outcomeCoverage:{ observedTurns, rate:uses.length > 0 ? Number((observedTurns / uses.length).toFixed(4)) : null },
    itemTelemetry:{ items:itemRows.length, withSimilarity:similarities.length, citedItems:itemRows.filter(item => item.cited === true).length, unusedItems:itemRows.filter(item => item.cited !== true).length, avgSimilarity:mean(similarities), citedAvgSimilarity:mean(citedSimilarities), unusedAvgSimilarity:mean(unusedSimilarities), shadowTurns },
    bySourceKind,
    summary,
  }}
}
