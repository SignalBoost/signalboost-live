import { createHash } from 'node:crypto'
import type {
  ContinuousLearningDecision,
  ContinuousLearningSourceKind,
  KnowledgeGap,
  LearningCandidate,
} from './index'
import { ContinuousLearningDirector } from './index'

export type LearningSourceDocument = {
  sourceKind: ContinuousLearningSourceKind
  sourceUri: string
  sourceTitle?: string
  observedAt?: string
  subject: string
  text: string
  license?: string | null
  evidence?: string[]
}

export interface ContinuousLearningSourceAdapter {
  readonly kind: ContinuousLearningSourceKind
  acquire(gap: KnowledgeGap): Promise<LearningSourceDocument[]>
}

export type LearningCycleResult = {
  gapsConsidered: number
  documentsAcquired: number
  accepted: number
  rejected: Record<string, number>
  externalCostUsd: number
}

/**
 * Runs one bounded proactive-learning cycle.
 *
 * Source adapters perform acquisition. This orchestrator never crawls arbitrary URLs and
 * never calls an AI provider directly. It converts acquired documents into deterministic
 * candidates, then lets ContinuousLearningDirector enforce provenance, confidence,
 * deduplication, source policy, candidate caps and budget.
 */
export class ContinuousLearningCycle {
  constructor(
    private readonly director: ContinuousLearningDirector,
    private readonly adapters: ContinuousLearningSourceAdapter[],
  ) {}

  async run(gaps: KnowledgeGap[], spentExternalCostUsd = 0): Promise<LearningCycleResult> {
    const prioritized = this.director.prioritizeGaps(gaps)
    const result: LearningCycleResult = {
      gapsConsidered: prioritized.length,
      documentsAcquired: 0,
      accepted: 0,
      rejected: {},
      externalCostUsd: spentExternalCostUsd,
    }

    for (const gap of prioritized) {
      for (const adapter of this.adapters) {
        const documents = await adapter.acquire(gap)
        result.documentsAcquired += documents.length
        for (const document of documents) {
          if (document.sourceKind !== adapter.kind) {
            this.recordDecision(result, { accepted: false, reason: 'source_not_allowed' })
            continue
          }
          const decision = await this.director.admit(this.toCandidate(document), result.externalCostUsd)
          this.recordDecision(result, decision)
          if (!decision.accepted && decision.reason === 'budget_exhausted') return result
        }
      }
    }
    return result
  }

  private toCandidate(document: LearningSourceDocument): LearningCandidate {
    const normalized = document.text.replace(/\s+/g, ' ').trim()
    const evidence = document.evidence?.filter(Boolean) ?? []
    if (!evidence.length && normalized) evidence.push(normalized.slice(0, 500))

    // Deterministic extraction is intentionally conservative. Rich semantic extraction can
    // be added later through the governed COS gateway; raw source text never becomes truth.
    const summary = normalized.slice(0, 1200)
    const confidence = normalized ? 0.8 : 0
    return {
      contentHash: createHash('sha256').update(`${document.sourceUri}\n${normalized}`).digest('hex'),
      sourceKind: document.sourceKind,
      sourceUri: document.sourceUri,
      sourceTitle: document.sourceTitle,
      observedAt: document.observedAt ?? new Date().toISOString(),
      subject: document.subject,
      summary,
      facts: normalized ? [{ predicate: 'source_summary', object: summary, confidence }] : [],
      confidence,
      license: document.license,
      evidence,
    }
  }

  private recordDecision(result: LearningCycleResult, decision: ContinuousLearningDecision) {
    if (decision.accepted) {
      result.accepted += 1
      return
    }
    result.rejected[decision.reason] = (result.rejected[decision.reason] ?? 0) + 1
  }
}
