export type LearningObservation = {
  taskId: string
  capability: string
  strategy: string
  succeeded: boolean
  latencyMs: number
  externalCostUsd: number
  reusable: boolean
}

export type LearnedStrategy = {
  capability: string
  strategy: string
  score: number
  observations: number
}

export interface LearningStore {
  observe(observation: LearningObservation): Promise<void>
  bestStrategy(taskId: string, capability: string): Promise<LearnedStrategy | null>
}

/** COS learns outcomes, never provider-specific behavior. */
export class LearningEngine {
  constructor(private readonly store: LearningStore) {}

  observe(observation: LearningObservation) {
    return this.store.observe(observation)
  }

  recommend(taskId: string, capability: string) {
    return this.store.bestStrategy(taskId, capability)
  }
}

export type ContinuousLearningSourceKind =
  | 'work_experience'
  | 'engineering_history'
  | 'official_documentation'
  | 'research_paper'
  | 'scientific_journal'
  | 'library_material'
  | 'news_article'
  | 'public_dataset'
  | 'video_transcript'
  | 'approved_public_web'

export type KnowledgeGap = {
  id: string
  subject: string
  question: string
  portableIds: string[]
  expectedReuse: number
  expectedAvoidedCostUsd: number
  urgency: number
  evidence: string[]
}

export type LearningCandidate = {
  contentHash: string
  sourceKind: ContinuousLearningSourceKind
  sourceUri: string
  sourceTitle?: string
  observedAt: string
  subject: string
  summary: string
  facts: Array<{ predicate: string; object: string; confidence: number }>
  confidence: number
  license?: string | null
  evidence: string[]
}

export type ContinuousLearningDecision =
  | { accepted: true; reason: 'new_verified_knowledge' }
  | { accepted: false; reason: 'duplicate' | 'source_not_allowed' | 'confidence_too_low' | 'missing_provenance' | 'no_reusable_facts' | 'budget_exhausted' }

export interface ContinuousLearningStore {
  hasContent(contentHash: string): Promise<boolean>
  remember(candidate: LearningCandidate): Promise<void>
}

export interface ContinuousLearningPolicy {
  allowedSourceKinds: ReadonlySet<ContinuousLearningSourceKind>
  minimumConfidence: number
  maxCandidatesPerCycle: number
  maxExternalCostUsdPerCycle: number
}

export const DEFAULT_CONTINUOUS_LEARNING_POLICY: ContinuousLearningPolicy = {
  allowedSourceKinds: new Set<ContinuousLearningSourceKind>([
    'work_experience',
    'engineering_history',
    'official_documentation',
    'research_paper',
    'scientific_journal',
    'library_material',
    'news_article',
    'public_dataset',
    'video_transcript',
    'approved_public_web',
  ]),
  minimumConfidence: 0.72,
  maxCandidatesPerCycle: 50,
  // Learning must save money over time, not create an unbounded background bill.
  maxExternalCostUsdPerCycle: 1,
}

/**
 * Governs proactive COS education.
 *
 * Acquisition is intentionally injected rather than performed here. A source adapter may
 * read approved documentation, repositories, datasets, papers, library material, news or
 * transcripts, but this director decides whether the result is trustworthy and reusable
 * enough to become COS knowledge. Duplicate content is rejected before storage and no
 * provider is called here.
 */
export class ContinuousLearningDirector {
  constructor(
    private readonly store: ContinuousLearningStore,
    private readonly policy: ContinuousLearningPolicy = DEFAULT_CONTINUOUS_LEARNING_POLICY,
  ) {}

  prioritizeGaps(gaps: KnowledgeGap[]): KnowledgeGap[] {
    const cap = Math.max(0, Math.floor(this.policy.maxCandidatesPerCycle))
    return [...gaps]
      .filter(gap => gap.question.trim() && gap.subject.trim())
      .sort((a, b) => this.gapScore(b) - this.gapScore(a))
      .slice(0, cap)
  }

  private gapScore(gap: KnowledgeGap): number {
    const reuse = Math.max(0, gap.expectedReuse)
    const savings = Math.max(0, gap.expectedAvoidedCostUsd)
    const urgency = Math.max(0, Math.min(100, gap.urgency)) / 100
    return reuse * 2 + savings * 10 + urgency
  }

  async admit(candidate: LearningCandidate, spentExternalCostUsd = 0): Promise<ContinuousLearningDecision> {
    if (spentExternalCostUsd > this.policy.maxExternalCostUsdPerCycle) {
      return { accepted: false, reason: 'budget_exhausted' }
    }
    if (!this.policy.allowedSourceKinds.has(candidate.sourceKind)) {
      return { accepted: false, reason: 'source_not_allowed' }
    }
    if (!candidate.sourceUri.trim() || !candidate.observedAt || !candidate.evidence.length) {
      return { accepted: false, reason: 'missing_provenance' }
    }
    if (!Number.isFinite(candidate.confidence) || candidate.confidence < this.policy.minimumConfidence) {
      return { accepted: false, reason: 'confidence_too_low' }
    }
    const reusableFacts = candidate.facts.filter(fact =>
      fact.predicate.trim() && fact.object.trim() && Number.isFinite(fact.confidence) && fact.confidence >= this.policy.minimumConfidence,
    )
    if (!reusableFacts.length) return { accepted: false, reason: 'no_reusable_facts' }
    if (await this.store.hasContent(candidate.contentHash)) return { accepted: false, reason: 'duplicate' }

    await this.store.remember({ ...candidate, facts: reusableFacts })
    return { accepted: true, reason: 'new_verified_knowledge' }
  }
}
