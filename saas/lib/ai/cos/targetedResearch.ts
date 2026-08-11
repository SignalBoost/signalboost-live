import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import { ContinuousLearningDirector, type ContinuousLearningPolicy, type KnowledgeGap } from '@/lib/cos-core/layers/learning'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { autonomousLearningIsExplicitlyEnabled } from '@/lib/cos-core/layers/learning/trigger'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
import { approvedUrlLearningAdapter, parseApprovedLearningUrls } from '@/lib/cos/dailyAutonomousLearning'

const TARGETED_RESEARCH_POLICY: ContinuousLearningPolicy = {
  allowedSourceKinds: new Set([
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
  maxCandidatesPerCycle: 24,
  // Research sources in this path are zero-LLM/public-data adapters only.
  maxExternalCostUsdPerCycle: 0,
}

export type TargetedResearchResult = {
  attempted: boolean
  documentsAcquired: number
  accepted: number
  rejected: Record<string, number>
  sourceAdapters: number
}

export async function runTargetedGapResearch(input: {
  prompt: string
  subject: string
}): Promise<TargetedResearchResult> {
  if (!autonomousLearningIsExplicitlyEnabled()) {
    return { attempted: false, documentsAcquired: 0, accepted: 0, rejected: {}, sourceAdapters: 0 }
  }

  const store = createSupabaseCOSStores()?.continuousLearning
  if (!store) {
    return { attempted: false, documentsAcquired: 0, accepted: 0, rejected: {}, sourceAdapters: 0 }
  }

  const approvedUrls = parseApprovedLearningUrls()
  const adapters = [
    ...(approvedUrls.length ? [approvedUrlLearningAdapter(approvedUrls)] : []),
    ...createLiveLearningAdapters(),
  ]

  if (!adapters.length) {
    return { attempted: false, documentsAcquired: 0, accepted: 0, rejected: {}, sourceAdapters: 0 }
  }

  const gap: KnowledgeGap = {
    id: `inline-research-${Date.now()}`,
    subject: input.subject || 'general reasoning',
    question: input.prompt,
    portableIds: [],
    expectedReuse: 1,
    expectedAvoidedCostUsd: 0.01,
    urgency: 90,
    evidence: ['COS local reasoning confidence was insufficient; research before any cloud-model fallback.'],
  }

  const director = new ContinuousLearningDirector(store, TARGETED_RESEARCH_POLICY)
  const cycle = new ContinuousLearningCycle(director, adapters)
  const result = await cycle.run([gap], 0)

  return {
    attempted: true,
    documentsAcquired: result.documentsAcquired,
    accepted: result.accepted,
    rejected: result.rejected,
    sourceAdapters: adapters.length,
  }
}
