// saas/lib/cos-core/layers/learning/gaps.ts
import type { ContinuousLearningSourceKind, KnowledgeGap } from './index.ts'

export type KnowledgeGapSignal = {
  taskId: string
  subject: string
  capability: string
  objective: string
  /** Optional host-selected acquisition focus; never replaces the competency or scoring question. */
  discoveryQuery?: string
  confidence?: number
  escalated?: boolean
  succeeded?: boolean
  missingFacts?: string[]
  repeatedCount?: number
  externalCostUsd?: number
  evidence?: string[]
  /** Optional host-selected source classes for this study objective. Empty/omitted means normal policy. */
  sourceKinds?: ContinuousLearningSourceKind[]
  /** Optional adapter-level exclusions when a source class contains multiple acquisition paths. */
  excludedAdapterIds?: string[]
  /** Declared by the producing lane: this signal is a governed curriculum/study objective. */
  curriculumAligned?: boolean
  portableIds?: string[]
}

/**
 * Curriculum alignment is a declaration made by the lane that produced the gap, not a guess from the
 * gap id. University study gaps are minted as `auto-gap:university:...`, so the original literal
 * prefix test silently excluded the entire University lane from the probationary tier that was built
 * to hold its metadata-class evidence. Lanes that have not yet declared keep the legacy behaviour.
 */
export function gapCurriculumAligned(gap:KnowledgeGap):boolean{return gap.curriculumAligned===true||gap.id.startsWith('curriculum:')}

export function knowledgeGapIdForSignal(signal: Pick<KnowledgeGapSignal, 'taskId' | 'capability'>): string {
  return `auto-gap:${signal.taskId}:${signal.capability}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function usefulSignals(signal: KnowledgeGapSignal): string[] {
  return [
    ...(signal.missingFacts ?? []).filter(Boolean),
    ...(signal.evidence ?? []).filter(Boolean),
    signal.escalated ? 'local reasoning escalated' : '',
    signal.succeeded === false ? 'previous attempt failed' : '',
  ].filter(Boolean)
}

/**
 * Converts operational uncertainty into explicit study questions without using an AI model.
 * The generated gaps are consumed by the existing governed continuous-learning pipeline.
 */
export function generateKnowledgeGaps(signals: KnowledgeGapSignal[]): KnowledgeGap[] {
  const byKey = new Map<string, KnowledgeGap>()

  for (const signal of signals) {
    const subject = signal.subject.trim()
    const objective = signal.objective.trim()
    if (!subject || !objective) continue

    const confidence = clamp(Number.isFinite(signal.confidence) ? signal.confidence! : 1, 0, 1)
    const repeated = Math.max(1, Math.floor(signal.repeatedCount ?? 1))
    const missing = (signal.missingFacts ?? []).map(value => value.trim()).filter(Boolean)
    const uncertain = confidence < 0.7 || signal.escalated || signal.succeeded === false || missing.length > 0
    if (!uncertain) continue

    const key = `${subject.toLowerCase()}::${signal.capability.toLowerCase()}::${objective.toLowerCase()}`
    const urgency = clamp(
      Math.round((1 - confidence) * 55 + (signal.escalated ? 20 : 0) + (signal.succeeded === false ? 20 : 0) + Math.min(15, repeated * 3)),
      1,
      100,
    )
    const expectedReuse = Math.max(1, repeated + (signal.escalated ? 2 : 0) + (signal.succeeded === false ? 1 : 0))
    const expectedAvoidedCostUsd = Math.max(0, Number(signal.externalCostUsd ?? 0)) * expectedReuse
    const universitySubjectGap = signal.taskId.startsWith('university:')
    const question = missing.length
      ? universitySubjectGap
        ? `${missing.join('; ')}. ${objective}`
        : `What verified knowledge resolves these missing facts for ${objective}: ${missing.join('; ')}?`
      : `What verified knowledge would let COS handle ${objective} locally with higher confidence?`

    const excludedAdapterIds = [...new Set(
      (signal.excludedAdapterIds ?? []).map(value => String(value).trim()).filter(Boolean),
    )]
    const gap: KnowledgeGap = {
      id: knowledgeGapIdForSignal(signal),
      subject,
      question,
      ...(signal.discoveryQuery?.trim() ? { discoveryQuery: signal.discoveryQuery.trim() } : {}),
      portableIds: [...new Set(signal.portableIds ?? [])],
      expectedReuse,
      expectedAvoidedCostUsd,
      urgency,
      evidence: usefulSignals(signal),
      sourceKinds: signal.sourceKinds?.length ? [...new Set(signal.sourceKinds)] : undefined,
      excludedAdapterIds: excludedAdapterIds.length ? excludedAdapterIds : undefined,
      ...(signal.curriculumAligned === true ? { curriculumAligned: true } : {}),
    }

    const previous = byKey.get(key)
    if (!previous || gap.urgency > previous.urgency) byKey.set(key, gap)
  }

  return [...byKey.values()].sort((a, b) => b.urgency - a.urgency || b.expectedReuse - a.expectedReuse)
}
