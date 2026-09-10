import type { ContinuousLearningSourceKind } from '@/lib/cos-core/layers/learning'
import type { KnowledgeGapSignal } from '@/lib/cos-core/layers/learning/gaps'
import {
  COS_UNIVERSITY_SUBJECTS,
  cosUniversitySubjectById,
  type CosUniversityGrade,
  type CosUniversitySubjectId,
  type CosUniversityTranscriptEntry,
} from './cosUniversity.ts'
import {
  COS_PLATFORM_LANGUAGES,
  type CosPlatformLanguage,
  type CosPlatformLanguageDimension,
  type CosPlatformLanguageTranscriptEntry,
} from './cosUniversityLanguages.ts'
import {
  cosUniversityHybridLearningDesign,
  type CosUniversityHybridLearningDesign,
} from './cosUniversityHybridLearning.ts'

export type CosUniversityFailureClass =
  | 'retrieval'
  | 'evidence_selection'
  | 'grounding'
  | 'stale_or_missing_knowledge'
  | 'reasoning'
  | 'calibration'
  | 'tool_execution'
  | 'language'
  | 'cross_domain'
  | 'retention'
  | 'unknown'

export type CosUniversityStudyMethodId =
  | 'rag_library'
  | 'live_authoritative_research'
  | 'owner_directed_material'
  | 'teacher_agent'
  | 'peer_agent_a2a'
  | 'deliberate_practice'
  | 'sandbox_lab'
  | 'production_replay'
  | 'independent_retest'
  | 'fine_tune_candidate'

export type CosUniversityStudyMethodExecution =
  | 'automatic_acquisition'
  | 'automatic_if_certifiable'
  | 'available_on_owner_submission'
  | 'requires_bridge'
  | 'candidate_only'

export type CosUniversityStudyMethod = {
  id: CosUniversityStudyMethodId
  execution: CosUniversityStudyMethodExecution
  reason: string
}

export type CosUniversityStudyStrategy = {
  failureClass: CosUniversityFailureClass
  methods: CosUniversityStudyMethod[]
  acquisitionSourceKinds: ContinuousLearningSourceKind[]
  fineTuneCandidate: boolean
  requiresIndependentRetest: true
  learningDesign: CosUniversityHybridLearningDesign
}

const RAG_SOURCE_KINDS: ContinuousLearningSourceKind[] = [
  'official_documentation',
  'research_paper',
  'scientific_journal',
  'library_material',
  'video_transcript',
]

const LIVE_SOURCE_KINDS: ContinuousLearningSourceKind[] = [
  'official_documentation',
  'research_paper',
  'scientific_journal',
  'news_article',
  'public_dataset',
  'approved_public_web',
]

// These are public study/retrieval themes, not hidden exam rubric content. A failed language
// dimension must remain explicit through acquisition so broad language material cannot silently
// satisfy a focused weakness such as writing or localization.
const LANGUAGE_DIMENSION_STUDY_THEMES: Record<CosPlatformLanguageDimension, string[]> = {
  comprehension: [
    'reading comprehension and semantic interpretation',
    'discourse and context comprehension',
    'ambiguity resolution in language comprehension',
    'register and nuance comprehension',
    'evidence-based reading comprehension methods',
  ],
  writing: [
    'written composition and sentence construction',
    'grammar syntax and punctuation in writing',
    'coherence organization and paragraph structure',
    'register tone and audience-aware writing',
    'editing revision and error correction',
  ],
  instruction_following: [
    'instruction parsing and intent comprehension',
    'constraint satisfaction in written instructions',
    'multi-step instruction execution',
    'format and requirement compliance',
    'ambiguity handling in instructions',
  ],
  translation_localization: [
    'meaning preservation in translation',
    'translation accuracy and equivalence',
    'localization conventions and locale adaptation',
    'idiom register and culturally appropriate translation',
    'locale-specific terminology and style',
  ],
  cultural_pragmatics: [
    'pragmatic meaning in communication',
    'politeness register and social context',
    'cultural context in language use',
    'speech acts implicature and conversational norms',
    'context-sensitive cross-cultural communication',
  ],
}

const LANGUAGE_DIMENSION_LABELS: Record<CosPlatformLanguageDimension, string> = {
  comprehension: 'comprehension',
  writing: 'writing',
  instruction_following: 'instruction following',
  translation_localization: 'translation and localization',
  cultural_pragmatics: 'cultural pragmatics',
}

// The generic reference adapter is useful for ordinary learning but currently resolves Wikipedia.
// University academic study may use the governed credible_web adapter in the same source-kind bucket,
// but tertiary encyclopedia retrieval must not create accepted study proof or readiness for an exam.
const UNIVERSITY_EXCLUDED_STUDY_ADAPTER_IDS = ['reference'] as const

function method(
  id: CosUniversityStudyMethodId,
  execution: CosUniversityStudyMethodExecution,
  reason: string,
): CosUniversityStudyMethod {
  return { id, execution, reason }
}

function uniqueKinds(kinds: ContinuousLearningSourceKind[]): ContinuousLearningSourceKind[] {
  return [...new Set(kinds)]
}

/**
 * Human-academic-learning adapted for machines: the learning lifecycle is standardized, but the
 * study method varies with the diagnosed weakness. This function is deliberately deterministic and
 * model-free so COS cannot choose an easier study method merely to improve its own score.
 *
 * Methods marked requires_bridge/candidate_only are recommendations, not execution claims. In
 * particular, A2A peers and fine-tuning are never silently invoked by this strategist.
 */
export function selectCosUniversityStudyStrategy(input: {
  failureClass: CosUniversityFailureClass
  repeatedFailures?: number
  independentRetestFailures?: number
}): CosUniversityStudyStrategy {
  const repeatedFailures = Math.max(0, Math.floor(Number(input.repeatedFailures || 0)))
  const independentRetestFailures = Math.max(0, Math.floor(Number(input.independentRetestFailures || 0)))
  const methods: CosUniversityStudyMethod[] = []
  let acquisitionSourceKinds: ContinuousLearningSourceKind[] = []

  switch (input.failureClass) {
    case 'stale_or_missing_knowledge':
      methods.push(
        method('live_authoritative_research', 'automatic_acquisition', 'Fresh/current-world gaps require current authoritative evidence.'),
        method('rag_library', 'automatic_acquisition', 'Durable validated findings should enter governed retrieval memory.'),
        method('independent_retest', 'automatic_if_certifiable', 'Fresh knowledge must transfer to an unseen case before it can affect a grade.'),
      )
      acquisitionSourceKinds = [...LIVE_SOURCE_KINDS]
      break
    case 'retrieval':
      methods.push(
        method('rag_library', 'automatic_acquisition', 'Retrieval failure calls for better relevant retained evidence and indexing inputs.'),
        method('live_authoritative_research', 'automatic_acquisition', 'Live sources can fill a genuine corpus gap without pretending pretrained memory is current.'),
        method('deliberate_practice', 'automatic_if_certifiable', 'Practice should verify that relevant evidence is actually retrieved on varied prompts.'),
        method('independent_retest', 'automatic_if_certifiable', 'Independent transfer separates real retrieval improvement from memorized practice.'),
      )
      acquisitionSourceKinds = uniqueKinds([...RAG_SOURCE_KINDS, ...LIVE_SOURCE_KINDS])
      break
    case 'evidence_selection':
    case 'grounding':
      methods.push(
        method('rag_library', 'automatic_acquisition', 'The learner needs varied trustworthy evidence on which to practice selection and grounding.'),
        method('deliberate_practice', 'automatic_if_certifiable', 'Selection/grounding is a procedural skill and needs exercises, not just more reading.'),
        method('teacher_agent', 'requires_bridge', 'A tutor/critic can explain why evidence is relevant or insufficient without becoming the examiner.'),
        method('independent_retest', 'automatic_if_certifiable', 'The examiner remains independent of the tutoring material.'),
      )
      acquisitionSourceKinds = [...RAG_SOURCE_KINDS]
      break
    case 'tool_execution':
      methods.push(
        method('sandbox_lab', 'requires_bridge', 'Execution weaknesses require doing the work in a bounded laboratory, not more passive reading.'),
        method('production_replay', 'requires_bridge', 'Recorded real-work failures are high-value practice when replay is safe and authorized.'),
        method('deliberate_practice', 'automatic_if_certifiable', 'Repeated tool exercises build procedural reliability.'),
        method('rag_library', 'automatic_acquisition', 'Official tool documentation supports the lab but does not substitute for it.'),
        method('independent_retest', 'automatic_if_certifiable', 'A different unseen task must prove execution transfer.'),
      )
      acquisitionSourceKinds = ['official_documentation', 'library_material']
      break
    case 'calibration':
      methods.push(
        method('deliberate_practice', 'automatic_if_certifiable', 'Calibration improves by predicting confidence and comparing it with outcomes across many cases.'),
        method('production_replay', 'requires_bridge', 'Real outcomes expose overconfidence that synthetic exercises may miss.'),
        method('teacher_agent', 'requires_bridge', 'A critic may explain calibration errors but cannot award the grade.'),
        method('independent_retest', 'automatic_if_certifiable', 'Fresh independent cases verify that confidence tracks correctness.'),
      )
      break
    case 'language':
      methods.push(
        method('rag_library', 'automatic_acquisition', 'Language study needs high-quality authentic text and reference material.'),
        method('live_authoritative_research', 'automatic_acquisition', 'Living language, terminology, and cultural pragmatics require fresh authentic usage.'),
        method('owner_directed_material', 'available_on_owner_submission', 'Owner-supplied material enters governed University study with provenance and intent after admission.'),
        method('teacher_agent', 'requires_bridge', 'A language tutor can diagnose grammar, register, localization, and pragmatic errors.'),
        method('peer_agent_a2a', 'requires_bridge', 'Peer dialogue can provide varied conversational and localization practice when A2A peers are connected.'),
        method('deliberate_practice', 'automatic_if_certifiable', 'Comprehension, writing, instruction following, localization, and pragmatics each need separate practice.'),
        method('independent_retest', 'automatic_if_certifiable', 'Each platform language and dimension requires its own unseen evidence.'),
      )
      acquisitionSourceKinds = uniqueKinds([...RAG_SOURCE_KINDS, ...LIVE_SOURCE_KINDS])
      break
    case 'cross_domain':
      methods.push(
        method('peer_agent_a2a', 'requires_bridge', 'Specialist/peer perspectives are useful for cross-domain synthesis when available.'),
        method('teacher_agent', 'requires_bridge', 'A professor/critic can challenge the integration of multiple disciplines.'),
        method('deliberate_practice', 'automatic_if_certifiable', 'Case-based synthesis practice is more appropriate than isolated fact memorization.'),
        method('production_replay', 'requires_bridge', 'Real multidisciplinary work provides transfer evidence.'),
        method('independent_retest', 'automatic_if_certifiable', 'A fresh cross-domain capstone must remain independent.'),
      )
      break
    case 'retention':
      methods.push(
        method('rag_library', 'automatic_acquisition', 'Revisit authoritative retained material before recertification.'),
        method('deliberate_practice', 'automatic_if_certifiable', 'Spaced retrieval/practice checks retention rather than re-reading alone.'),
        method('independent_retest', 'automatic_if_certifiable', 'Recertification requires fresh evidence.'),
      )
      acquisitionSourceKinds = [...RAG_SOURCE_KINDS]
      break
    case 'reasoning':
    case 'unknown':
    default:
      methods.push(
        method('teacher_agent', 'requires_bridge', 'Conceptual/reasoning gaps benefit from explanation and critique.'),
        method('peer_agent_a2a', 'requires_bridge', 'Peer debate can expose alternative hypotheses when A2A peers are connected.'),
        method('deliberate_practice', 'automatic_if_certifiable', 'Reasoning transfer requires varied problems rather than passive ingestion.'),
        method('rag_library', 'automatic_acquisition', 'Authoritative material supplies concepts and examples for deliberate practice.'),
        method('independent_retest', 'automatic_if_certifiable', 'Fresh independent cases decide whether the reasoning actually improved.'),
      )
      acquisitionSourceKinds = [...RAG_SOURCE_KINDS]
      break
  }

  const fineTuneCandidate = repeatedFailures >= 3 && independentRetestFailures >= 2
  if (fineTuneCandidate) {
    methods.push(method(
      'fine_tune_candidate',
      'candidate_only',
      'Repeated independently verified failures remain after ordinary study; fine-tuning may be evaluated as a controlled experiment, never assumed to be the answer.',
    ))
  }

  const sourceKinds = uniqueKinds(acquisitionSourceKinds)
  return {
    failureClass: input.failureClass,
    methods,
    acquisitionSourceKinds: sourceKinds,
    fineTuneCandidate,
    requiresIndependentRetest: true,
    learningDesign: cosUniversityHybridLearningDesign({
      failureClass: input.failureClass,
      sourceKinds,
      fineTuneCandidate,
    }),
  }
}

const GRADE_RANK: Record<CosUniversityGrade, number> = {
  unassessed: -1,
  F: 0,
  D: 1,
  C: 2,
  B: 3,
  'A-': 4,
  A: 5,
  'A+': 6,
}

/** Rotate under-target subjects instead of starving the curriculum on the first unassessed subject. */
export function rotatingUniversitySubjectTarget(
  transcript: CosUniversityTranscriptEntry[],
  cycleIndex: number,
  targetGrade: 'A' | 'A+' = 'A+',
): CosUniversityTranscriptEntry | null {
  const byId = new Map(transcript.map(entry => [entry.subjectId, entry] as const))
  const targetRank = GRADE_RANK[targetGrade]
  const candidates = COS_UNIVERSITY_SUBJECTS
    .map(subject => byId.get(subject.id))
    .filter((entry): entry is CosUniversityTranscriptEntry => Boolean(entry && GRADE_RANK[entry.grade] < targetRank))
  if (!candidates.length) return null
  const index = ((Math.trunc(cycleIndex) % candidates.length) + candidates.length) % candidates.length
  return candidates[index]
}

export function rotatingPlatformLanguageTarget(
  transcript: CosPlatformLanguageTranscriptEntry[],
  cycleIndex: number,
  targetGrade: 'A' | 'A+' = 'A+',
): CosPlatformLanguageTranscriptEntry | null {
  const byLanguage = new Map(transcript.map(entry => [entry.language, entry] as const))
  const targetRank = GRADE_RANK[targetGrade]
  const candidates = COS_PLATFORM_LANGUAGES
    .map(language => byLanguage.get(language.id))
    .filter((entry): entry is CosPlatformLanguageTranscriptEntry => Boolean(entry && GRADE_RANK[entry.grade] < targetRank))
  if (!candidates.length) return null
  const index = ((Math.trunc(cycleIndex) % candidates.length) + candidates.length) % candidates.length
  return candidates[index]
}

export function detectPlatformLanguages(text: unknown): CosPlatformLanguage[] {
  const value = String(text ?? '').toLowerCase()
  const found: CosPlatformLanguage[] = []
  const patterns: Array<[CosPlatformLanguage, RegExp]> = [
    ['en', /\b(?:english|\ben\b)/i],
    ['es', /\b(?:spanish|español|\bes\b)/i],
    ['pt', /\b(?:portuguese|português|\bpt\b)/i],
    ['pl', /\b(?:polish|polski|\bpl\b)/i],
    ['ru', /\b(?:russian|русск|\bru\b)/i],
  ]
  for (const [language, pattern] of patterns) if (pattern.test(value)) found.push(language)
  return found
}

export function universityStudyGapSignal(input: {
  planKey: string
  subjectId: CosUniversitySubjectId
  objective: string
  failureClass: CosUniversityFailureClass
  strategy: CosUniversityStudyStrategy
  repeatedCount?: number
  studyVariant?: number
  evidence?: string[]
}): KnowledgeGapSignal {
  const subject = cosUniversitySubjectById(input.subjectId)
  const themes = [...subject.studyThemes]
  const offset = themes.length ? Math.abs(Math.floor(Number(input.studyVariant || 0))) % themes.length : 0
  const rotatedThemes = [...themes.slice(offset), ...themes.slice(0, offset)]
  return {
    taskId: `university:${input.planKey}`,
    subject: subject.title,
    capability: `cos_university.${input.subjectId}`,
    objective: input.objective,
    discoveryQuery: [...rotatedThemes.slice(0, 2), subject.title].join(' '),
    confidence: 0,
    escalated: true,
    succeeded: false,
    missingFacts: rotatedThemes,
    repeatedCount: Math.max(1, Math.floor(Number(input.repeatedCount || 1))),
    evidence: [
      'cos_university_continuous_learning',
      `university_subject=${input.subjectId}`,
      `failure_class=${input.failureClass}`,
      ...input.strategy.methods.map(item => `study_method=${item.id}:${item.execution}`),
      ...input.strategy.learningDesign.paradigms.map(item => `learning_paradigm=${item}`),
      ...input.strategy.learningDesign.dataStructures.map(item => `data_structure=${item}`),
      `learning_promotion=${input.strategy.learningDesign.promotionRule}`,
      ...(input.evidence || []),
    ],
    sourceKinds: input.strategy.acquisitionSourceKinds,
    excludedAdapterIds: [...UNIVERSITY_EXCLUDED_STUDY_ADAPTER_IDS],
    portableIds: ['cos'],
  }
}

export function platformLanguageStudyGapSignal(input: {
  planKey: string
  language: CosPlatformLanguage
  dimension?: CosPlatformLanguageDimension | null
  objective: string
  strategy: CosUniversityStudyStrategy
  repeatedCount?: number
}): KnowledgeGapSignal {
  const language = COS_PLATFORM_LANGUAGES.find(item => item.id === input.language)
  if (!language) throw new Error(`Unknown platform language: ${input.language}`)
  const dimension = input.dimension || null
  const dimensionLabel = dimension ? LANGUAGE_DIMENSION_LABELS[dimension] : null
  const studyThemes = dimension ? LANGUAGE_DIMENSION_STUDY_THEMES[dimension] : []
  return {
    taskId: `university-language:${input.planKey}`,
    subject: dimensionLabel ? `${language.title} ${dimensionLabel}` : `${language.title} language and communication`,
    capability: dimension ? `cos_university.language.${language.id}.${dimension}` : `cos_university.language.${language.id}`,
    objective: input.objective,
    confidence: 0,
    escalated: true,
    succeeded: false,
    ...(dimension ? { missingFacts: studyThemes.map(theme => `${language.title} ${theme}`) } : {}),
    repeatedCount: Math.max(1, Math.floor(Number(input.repeatedCount || 1))),
    evidence: [
      'cos_university_continuous_learning',
      `platform_language=${language.id}`,
      ...(dimension
        ? [`language_dimension=${dimension}`]
        : ['language_dimensions=comprehension,writing,instruction_following,translation_localization,cultural_pragmatics']),
      ...input.strategy.methods.map(item => `study_method=${item.id}:${item.execution}`),
    ],
    sourceKinds: input.strategy.acquisitionSourceKinds,
    excludedAdapterIds: [...UNIVERSITY_EXCLUDED_STUDY_ADAPTER_IDS],
    portableIds: ['cos'],
  }
}
