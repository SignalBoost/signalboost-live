export type CosBenchmarkCategory =
  | 'utility'
  | 'routing'
  | 'technical_reasoning'
  | 'business_reasoning'
  | 'enterprise_memory'
  | 'knowledge_graph'
  | 'continuous_learning'
  | 'cache_reuse'
  | 'provenance'
  | 'isolation'

export const REQUIRED_COS_BENCHMARK_CATEGORIES: readonly CosBenchmarkCategory[] = [
  'utility',
  'routing',
  'technical_reasoning',
  'business_reasoning',
  'enterprise_memory',
  'knowledge_graph',
  'continuous_learning',
  'cache_reuse',
  'provenance',
  'isolation',
]

export interface CosBenchmarkObservation {
  id: string
  category: CosBenchmarkCategory
  passed: boolean
  confidence: number
  latencyMs: number
  responseSource: string
  reasonerLabel: string | null
  knowledgeFactsUsed: number
  learnedItemsUsed: number
  userMemoriesUsed: number
  externalAiInvoked: boolean
  localModelInvoked: boolean
  inferenceAvoided?: boolean
  localCallsAvoided?: number
  externalCallsAvoided?: number
  estimatedExternalTokensAvoided?: number
  estimatedExternalCostAvoidedUsd?: number
  notes?: string
}

export interface CosBenchmarkSummary {
  schemaVersion: 1
  generatedAt: string
  total: number
  passed: number
  failed: number
  passRate: number
  requiredCategoriesPass: boolean
  isolationPass: boolean
  cacheReusePass: boolean
  internalKnowledgeContributionPass: boolean
  totalLatencyMs: number
  averageLatencyMs: number
  localCallsAvoided: number
  externalCallsAvoided: number
  estimatedExternalTokensAvoided: number
  estimatedExternalCostAvoidedUsd: number
  observations: CosBenchmarkObservation[]
}

export function summarizeCosBenchmark(
  observations: CosBenchmarkObservation[],
  generatedAt = new Date().toISOString(),
): CosBenchmarkSummary {
  const passed = observations.filter(item => item.passed).length
  const hasCategory = (category: CosBenchmarkCategory) => observations.some(item => item.category === category)
  const categoryPasses = (category: CosBenchmarkCategory) =>
    hasCategory(category) && observations.filter(item => item.category === category).every(item => item.passed)

  const requiredCategoriesPass = REQUIRED_COS_BENCHMARK_CATEGORIES.every(category => categoryPasses(category))
  const evidenceCountForCategory = (category: CosBenchmarkCategory) => observations
    .filter(item => item.category === category)
    .reduce((total, item) => total + (
      category === 'enterprise_memory'
        ? item.userMemoriesUsed
        : category === 'knowledge_graph'
          ? item.knowledgeFactsUsed
          : item.learnedItemsUsed
    ), 0)

  const internalCategories: CosBenchmarkCategory[] = ['enterprise_memory', 'knowledge_graph', 'continuous_learning']
  const internalKnowledgeContributionPass = internalCategories.every(category =>
    categoryPasses(category) && evidenceCountForCategory(category) > 0,
  )
  const totalLatencyMs = observations.reduce((total, item) => total + Math.max(0, item.latencyMs || 0), 0)
  const localCallsAvoided = observations.reduce((total, item) => total + Math.max(0, item.localCallsAvoided || 0), 0)
  const externalCallsAvoided = observations.reduce((total, item) => total + Math.max(0, item.externalCallsAvoided || 0), 0)
  const estimatedExternalTokensAvoided = observations.reduce((total, item) => total + Math.max(0, item.estimatedExternalTokensAvoided || 0), 0)
  const estimatedExternalCostAvoidedUsd = Number(observations
    .reduce((total, item) => total + Math.max(0, item.estimatedExternalCostAvoidedUsd || 0), 0)
    .toFixed(8))

  return {
    schemaVersion: 1,
    generatedAt,
    total: observations.length,
    passed,
    failed: observations.length - passed,
    passRate: observations.length ? passed / observations.length : 0,
    requiredCategoriesPass,
    isolationPass: categoryPasses('isolation') && observations
      .filter(item => item.category === 'isolation')
      .every(item => item.externalAiInvoked === false),
    cacheReusePass: categoryPasses('cache_reuse') && observations
      .filter(item => item.category === 'cache_reuse')
      .every(item => item.inferenceAvoided === true),
    internalKnowledgeContributionPass,
    totalLatencyMs,
    averageLatencyMs: observations.length ? totalLatencyMs / observations.length : 0,
    localCallsAvoided,
    externalCallsAvoided,
    estimatedExternalTokensAvoided,
    estimatedExternalCostAvoidedUsd,
    observations,
  }
}

export function benchmarkExitCode(summary: CosBenchmarkSummary): 0 | 1 {
  return summary.failed === 0
    && summary.requiredCategoriesPass
    && summary.isolationPass
    && summary.cacheReusePass
    && summary.internalKnowledgeContributionPass
    ? 0
    : 1
}
