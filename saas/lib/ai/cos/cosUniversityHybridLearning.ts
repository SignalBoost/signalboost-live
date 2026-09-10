import type { ContinuousLearningSourceKind } from '@/lib/cos-core/layers/learning'

export type CosUniversityLearningParadigm =
  | 'supervised'
  | 'unsupervised'
  | 'semi_supervised'
  | 'self_supervised'
  | 'reinforcement_feedback'
  | 'retrieval_augmented'
  | 'fine_tune_candidate'

export type CosUniversityDataStructure = 'structured' | 'semi_structured' | 'unstructured'

export type CosUniversityLearningMeasurement =
  | 'pre_study_baseline'
  | 'post_study_comprehension'
  | 'unseen_transfer'
  | 'practical_execution'
  | 'delayed_retention'
  | 'source_attribution'

export type CosUniversityHybridLearningDesign = Readonly<{
  paradigms: readonly CosUniversityLearningParadigm[]
  dataStructures: readonly CosUniversityDataStructure[]
  measurements: readonly CosUniversityLearningMeasurement[]
  promotionRule: 'independent_improvement_and_transfer_required'
}>

const ALL_MEASUREMENTS: readonly CosUniversityLearningMeasurement[] = [
  'pre_study_baseline',
  'post_study_comprehension',
  'unseen_transfer',
  'practical_execution',
  'delayed_retention',
  'source_attribution',
]

const STRUCTURE_BY_SOURCE: Partial<Record<ContinuousLearningSourceKind, readonly CosUniversityDataStructure[]>> = {
  public_dataset: ['structured', 'semi_structured'],
  official_documentation: ['semi_structured', 'unstructured'],
  research_paper: ['semi_structured', 'unstructured'],
  scientific_journal: ['semi_structured', 'unstructured'],
  library_material: ['structured', 'semi_structured', 'unstructured'],
  news_article: ['unstructured'],
  video_transcript: ['semi_structured', 'unstructured'],
  approved_public_web: ['semi_structured', 'unstructured'],
  work_experience: ['structured', 'semi_structured', 'unstructured'],
  engineering_history: ['structured', 'semi_structured', 'unstructured'],
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

/**
 * Converts a study objective into an explicit machine-adapted pedagogy. No single paradigm is
 * treated as universal: RAG grounds durable/static facts, labels teach known answers, discovery
 * methods expose latent structure, and verified outcomes provide feedback. Reading alone never
 * satisfies the promotion rule.
 */
export function cosUniversityHybridLearningDesign(input: {
  failureClass: string
  sourceKinds: readonly ContinuousLearningSourceKind[]
  fineTuneCandidate?: boolean
}): CosUniversityHybridLearningDesign {
  const paradigms: CosUniversityLearningParadigm[] = ['supervised', 'self_supervised']

  if (['retrieval', 'grounding', 'stale_or_missing_knowledge', 'retention'].includes(input.failureClass)) {
    paradigms.push('retrieval_augmented')
  }
  if (['evidence_selection', 'reasoning', 'cross_domain', 'language', 'unknown'].includes(input.failureClass)) {
    paradigms.push('unsupervised', 'semi_supervised')
  }
  if (['calibration', 'tool_execution', 'reasoning', 'cross_domain', 'language', 'unknown'].includes(input.failureClass)) {
    paradigms.push('reinforcement_feedback')
  }
  if (input.fineTuneCandidate) paradigms.push('fine_tune_candidate')

  const structures = unique(input.sourceKinds.flatMap(kind => STRUCTURE_BY_SOURCE[kind] || []))
  // A method with no acquisition source (for example a sandbox lab) still has structured outcomes,
  // semi-structured traces, and unstructured explanations available for learning.
  const dataStructures = structures.length
    ? structures
    : ['structured', 'semi_structured', 'unstructured'] satisfies CosUniversityDataStructure[]

  return {
    paradigms: unique(paradigms),
    dataStructures,
    measurements: ALL_MEASUREMENTS,
    promotionRule: 'independent_improvement_and_transfer_required',
  }
}

export type CosUniversityLearningMeasurementResult = Readonly<{
  normalizedGain: number | null
  promotionEligible: boolean
  missing: readonly CosUniversityLearningMeasurement[]
}>

/** Host-side learning proof: exposure/embedding counts are intentionally absent. */
export function evaluateCosUniversityLearning(input: {
  baselineScore?: number | null
  postStudyScore?: number | null
  passedUnseenTransfer: boolean
  passedPracticalExecution: boolean
  passedDelayedRetention: boolean
  verifiedSourceAttribution: boolean
  independentScorer: boolean
}): CosUniversityLearningMeasurementResult {
  const baseline = Number(input.baselineScore)
  const post = Number(input.postStudyScore)
  const validScores = Number.isFinite(baseline) && Number.isFinite(post)
    && baseline >= 0 && baseline <= 100 && post >= 0 && post <= 100
  const normalizedGain = validScores
    ? baseline >= 100 ? (post >= 100 ? 1 : 0) : Math.max(-1, Math.min(1, (post - baseline) / (100 - baseline)))
    : null
  const passed: Record<CosUniversityLearningMeasurement, boolean> = {
    pre_study_baseline: validScores,
    post_study_comprehension: validScores && post > baseline,
    unseen_transfer: input.passedUnseenTransfer,
    practical_execution: input.passedPracticalExecution,
    delayed_retention: input.passedDelayedRetention,
    source_attribution: input.verifiedSourceAttribution,
  }
  const missing = ALL_MEASUREMENTS.filter(metric => !passed[metric])
  return {
    normalizedGain,
    promotionEligible: input.independentScorer && missing.length === 0,
    missing,
  }
}
