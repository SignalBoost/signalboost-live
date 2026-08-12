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
  notes?: string
}

export interface CosBenchmarkSummary {
  schemaVersion: 1
  generatedAt: string
  total: number
  passed: number
  failed: number
  passRate: number
  isolationPass: boolean
  cacheReusePass: boolean
  internalKnowledgeContributionPass: boolean
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

  const internalCategories: CosBenchmarkCategory[] = ['enterprise_memory', 'knowledge_graph', 'continuous_learning']
  const internalKnowledgeContributionPass = internalCategories.every(category => categoryPasses(category))

  return {
    schemaVersion: 1,
    generatedAt,
    total: observations.length,
    passed,
    failed: observations.length - passed,
    passRate: observations.length ? passed / observations.length : 0,
    isolationPass: categoryPasses('isolation') && observations
      .filter(item => item.category === 'isolation')
      .every(item => item.externalAiInvoked === false),
    cacheReusePass: categoryPasses('cache_reuse') && observations
      .filter(item => item.category === 'cache_reuse')
      .every(item => item.inferenceAvoided === true),
    internalKnowledgeContributionPass,
    observations,
  }
}

export function benchmarkExitCode(summary: CosBenchmarkSummary): 0 | 1 {
  return summary.failed === 0
    && summary.isolationPass
    && summary.cacheReusePass
    && summary.internalKnowledgeContributionPass
    ? 0
    : 1
}
