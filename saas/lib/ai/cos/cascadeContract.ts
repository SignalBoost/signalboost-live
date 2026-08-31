export type CascadeAnswerability = 'current_evidence' | 'retrievable_source' | 'durable_knowledge'
export type CascadeAnswerPathType = 'rag_query' | 'durable_knowledge' | 'hybrid'
export type CascadeStatus = 'candidate' | 'validated' | 'rendered' | 'rejected' | 'invalidated'

export type CascadeProvenanceStrategy = {
  expected_sources: string[]
  min_sources: number
  must_be_root_topic_relevant: true
}

export type CascadeAnswerPath = {
  type: CascadeAnswerPathType
  query_plan: Array<{
    step: 'semantic_expand' | 'source_selection' | 'evidence_retrieval' | 'answer_synthesis'
    input?: string
    constraints?: { root_topic: string }
    targets?: string[]
    strategy?: 'top_k'
    k?: number
    requirements?: { must_cite_sources: true; must_preserve_root_topic: true }
  }>
}

export type CascadeCandidate = {
  question: string
  display_text: string
  root_question: string
  root_topic: string
  answer_path: CascadeAnswerPath
  answerability: CascadeAnswerability
  provenance_strategy: CascadeProvenanceStrategy
  topic_affinity: {
    score: number
    threshold: number
    root_topic: string
    affinity_basis: string[]
  }
  status: CascadeStatus
  rejection_reason: string | null
}

export type CascadePlan = {
  root_question: string
  root_topic: string
  candidates: CascadeCandidate[]
}

const AFFINITY_THRESHOLD = 0.8
const STOPWORDS = new Set([
  'what','which','who','whom','whose','when','where','why','how','does','do','did','is','are','was','were',
  'the','a','an','and','or','to','of','for','on','in','with','from','about','specific','factors','contribute',
  'between','should','could','would','can','does','that','this','those','these','current','published','answer',
])

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function terms(value: string): string[] {
  const matches: string[] = clean(value).toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]{2,}/gu) || []
  return [...new Set(matches.filter(term => !STOPWORDS.has(term)))].slice(0, 24)
}

export function rootTopicFromQuestion(question: string): string {
  return terms(question).slice(0, 8).join(' ') || clean(question).slice(0, 120) || 'conversation topic'
}

export function cascadeTopicAffinity(rootQuestion: string, candidateQuestion: string): CascadeCandidate['topic_affinity'] {
  const rootTerms = terms(rootQuestion)
  const candidateTerms = terms(candidateQuestion)
  const shared = rootTerms.filter(term => candidateTerms.includes(term))
  const score = rootTerms.length === 0 ? 1 : Math.min(1, shared.length / Math.max(1, Math.min(3, rootTerms.length)))
  return {
    score,
    threshold: AFFINITY_THRESHOLD,
    root_topic: rootTopicFromQuestion(rootQuestion),
    affinity_basis: shared.map(term => `shared_term:${term}`),
  }
}

function displayText(question: string): string {
  return clean(question).replace(/[?]+$/, '').slice(0, 72)
}

function provenanceStrategy(sourceTitles: string[]): CascadeProvenanceStrategy {
  const expected = sourceTitles.length ? sourceTitles.slice(0, 8) : ['live_external_retrieval']
  return {
    expected_sources: expected,
    min_sources: sourceTitles.length >= 2 ? 2 : 1,
    must_be_root_topic_relevant: true,
  }
}

function answerPath(rootQuestion: string, question: string, sourceTitles: string[]): CascadeAnswerPath {
  const rootTopic = rootTopicFromQuestion(rootQuestion)
  const targets = sourceTitles.length ? sourceTitles.slice(0, 8) : ['live_external_retrieval']
  return {
    type: sourceTitles.length ? 'hybrid' : 'rag_query',
    query_plan: [
      { step: 'semantic_expand', input: question, constraints: { root_topic: rootTopic } },
      { step: 'source_selection', targets },
      { step: 'evidence_retrieval', strategy: 'top_k', k: 5 },
      { step: 'answer_synthesis', requirements: { must_cite_sources: true, must_preserve_root_topic: true } },
    ],
  }
}

function isExecutablePath(path: CascadeAnswerPath): boolean {
  const steps = path.query_plan.map(step => step.step)
  return path.query_plan.length === 4
    && steps[0] === 'semantic_expand'
    && steps[1] === 'source_selection'
    && steps[2] === 'evidence_retrieval'
    && steps[3] === 'answer_synthesis'
}

export function validateCascadeCandidate(args: {
  rootQuestion: string
  question: string
  sourceTitles?: string[]
}): CascadeCandidate {
  const rootQuestion = clean(args.rootQuestion)
  const question = clean(args.question)
  const sourceTitles = [...new Set((args.sourceTitles || []).map(clean).filter(Boolean))].slice(0, 8)
  const affinity = cascadeTopicAffinity(rootQuestion, question)
  const path = answerPath(rootQuestion, question, sourceTitles)
  const provenance = provenanceStrategy(sourceTitles)
  let status: CascadeStatus = 'candidate'
  let rejectionReason: string | null = null

  if (!question || !question.endsWith('?')) {
    status = 'rejected'
    rejectionReason = 'invalid_question_shape'
  } else if (affinity.score < affinity.threshold) {
    status = 'rejected'
    rejectionReason = 'root_topic_affinity_failed'
  } else if (!isExecutablePath(path)) {
    status = 'rejected'
    rejectionReason = 'answer_path_not_executable'
  } else if (!provenance.expected_sources.length || provenance.min_sources < 1) {
    status = 'rejected'
    rejectionReason = 'provenance_strategy_not_feasible'
  } else {
    status = 'validated'
  }

  return {
    question,
    display_text: displayText(question),
    root_question: rootQuestion,
    root_topic: rootTopicFromQuestion(rootQuestion),
    answer_path: path,
    answerability: sourceTitles.length ? 'current_evidence' : 'retrievable_source',
    provenance_strategy: provenance,
    topic_affinity: affinity,
    status,
    rejection_reason: rejectionReason,
  }
}

export function buildCascadePlan(args: {
  rootQuestion: string
  questions: string[]
  sourceTitles?: string[]
}): CascadePlan {
  const rootQuestion = clean(args.rootQuestion)
  const candidates = args.questions
    .map(question => validateCascadeCandidate({ rootQuestion, question, sourceTitles: args.sourceTitles }))
    .filter(candidate => candidate.status === 'validated')
    .slice(0, 2)
    .map(candidate => ({ ...candidate, status: 'rendered' as const }))
  return { root_question: rootQuestion, root_topic: rootTopicFromQuestion(rootQuestion), candidates }
}
