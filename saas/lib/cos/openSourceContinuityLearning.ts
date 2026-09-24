import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningDirector, type ContinuousLearningStore, type KnowledgeGap } from '@/lib/cos-core/layers/learning'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { withSharedLearningSourceProviderLeases } from '@/lib/cos-core/layers/learning/providerLease'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
import { openSourceContinuityCurriculum } from './dailyAutonomousLearning.ts'

export type OpenSourceContinuityResult = {
  status: 'skipped' | 'learned'
  skipReason?: string
  gaps: Array<{ id: string; adapter: string | null; query: string | undefined }>
  gapsConsidered: number
  documentsAcquired: number
  accepted: number
  probationary: number
  rejected: Record<string, number>
  sourceErrors: Record<string, number>
  semanticScholarApiKeyConfigured?: boolean
}

const OPEN_SOURCE_CONTINUITY_POLICY = {
  allowedSourceKinds: new Set([
    'scientific_journal',
    'approved_public_web',
  ] as const),
  minimumConfidence: 0.72,
  maxCandidatesPerCycle: 12,
  maxExternalCostUsdPerCycle: 0,
}

function continuityGaps(now: Date): KnowledgeGap[] {
  return openSourceContinuityCurriculum(now).filter(gap =>
    gap.allowedAdapterIds?.includes('semantic_scholar')
    || gap.allowedAdapterIds?.includes('reference'),
  )
}

export async function runOpenSourceContinuityLearning(input: {
  now?: Date
  store?: ContinuousLearningStore
} = {}): Promise<OpenSourceContinuityResult> {
  if (process.env.COS_AUTONOMOUS_LEARNING_ENABLED !== 'true') {
    return {
      status: 'skipped',
      skipReason: 'autonomous_learning_disabled',
      gaps: [],
      gapsConsidered: 0,
      documentsAcquired: 0,
      accepted: 0,
      probationary: 0,
      rejected: {},
      sourceErrors: {},
    }
  }
  if (process.env.COS_LIVE_SOURCES_ENABLED === 'false') {
    return {
      status: 'skipped',
      skipReason: 'live_sources_disabled',
      gaps: [],
      gapsConsidered: 0,
      documentsAcquired: 0,
      accepted: 0,
      probationary: 0,
      rejected: {},
      sourceErrors: {},
    }
  }

  const store = input.store ?? createSupabaseCOSStores()?.continuousLearning
  if (!store) {
    return {
      status: 'skipped',
      skipReason: 'persistent_store_unavailable',
      gaps: [],
      gapsConsidered: 0,
      documentsAcquired: 0,
      accepted: 0,
      probationary: 0,
      rejected: {},
      sourceErrors: {},
    }
  }

  const now = input.now ?? new Date()
  const gaps = continuityGaps(now)
  const leaseSlot = Math.floor(now.getTime() / (15 * 60_000))
  const adapters = withSharedLearningSourceProviderLeases(
    createLiveLearningAdapters(),
    `open-source-continuity:${leaseSlot}`,
  )

  const director = new ContinuousLearningDirector(store, OPEN_SOURCE_CONTINUITY_POLICY)
  const cycle = new ContinuousLearningCycle(director, adapters)
  const result = await cycle.run(gaps, 0)
  const summary = {
    status: 'learned' as const,
    gaps: gaps.map(gap => ({
      id: gap.id,
      adapter: gap.allowedAdapterIds?.[0] ?? null,
      query: gap.discoveryQuery,
    })),
    gapsConsidered: result.gapsConsidered,
    documentsAcquired: result.documentsAcquired,
    accepted: result.accepted,
    probationary: result.probationary,
    rejected: result.rejected,
    sourceErrors: result.sourceErrors,
    semanticScholarApiKeyConfigured: Boolean(String(process.env.SEMANTIC_SCHOLAR_API_KEY || '').trim()),
  }

  console.info('[cos-open-source-continuity]', JSON.stringify(summary))
  return summary
}
