import { createHash } from 'node:crypto'
import type { LearningSourceDocument, RelevanceScore } from '../../cos-core/layers/learning/cycle.ts'
import type { ContinuousLearningSourceKind } from '../../cos-core/layers/learning/index.ts'

export type DirectedStudyGates = {
  distinctTerms(text: string): string[]
  relevanceOf(doc: LearningSourceDocument, terms: { anchors: string[]; supporting: string[] }): RelevanceScore
  sourceAwareRelevant(doc: LearningSourceDocument, score: RelevanceScore, terms: { anchors: string[]; supporting: string[] }): boolean
  candidate0Confidence(doc: LearningSourceDocument, score: RelevanceScore): number
}

export type DirectedMaterialKind = 'book' | 'article' | 'video' | 'documentation' | 'own_notes'

export const DIRECTED_SOURCE_KIND: Record<DirectedMaterialKind, ContinuousLearningSourceKind> = {
  book: 'library_material',
  article: 'news_article',
  video: 'video_transcript',
  documentation: 'official_documentation',
  own_notes: 'work_experience',
}

export type DirectedStudySubmission = {
  topic: string
  studyIntent: string
  materialKind: DirectedMaterialKind
  license: string
  sourceUri: string
  sourceTitle?: string | null
  text: string
  submittedBy?: string | null
  observedAt?: string | null
}

export type DirectedChunkVerdict = {
  index: number
  contentHash: string
  admitted: boolean
  reason: 'admitted_owner_directed' | 'too_short'
  confidence: number
  coverage: number
  matchedTerms: string[]
  intentAligned: boolean
  admissionBasis: 'owner_directed_intent'
  summary: string
}

export type DirectedStudyAssessment = {
  ok: boolean
  error?: string
  sourceKind: ContinuousLearningSourceKind | null
  subject: string
  chunks: DirectedChunkVerdict[]
  admitted: number
  rejected: number
}

export const CHUNK_TARGET_CHARACTERS = 4000
export const MAX_CHUNKS_PER_SUBMISSION = 20
export const MINIMUM_CHUNK_CHARACTERS = 200
export const MAX_SUBMISSION_CHARACTERS = CHUNK_TARGET_CHARACTERS * MAX_CHUNKS_PER_SUBMISSION

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()

export function validateDirectedSubmission(submission: DirectedStudySubmission) {
  if (clean(submission.topic).length < 4) return 'topic is required (min 4 characters)'
  if (clean(submission.studyIntent).length < 12) return 'studyIntent is required (min 12 characters)'
  if (!clean(submission.license)) return 'license is required'
  if (!(submission.materialKind in DIRECTED_SOURCE_KIND)) return 'materialKind is invalid'
  if (!clean(submission.sourceUri)) return 'sourceUri is required'
  if (String(submission.text || '').trim().length < MINIMUM_CHUNK_CHARACTERS) {
    return `text is too short to study (min ${MINIMUM_CHUNK_CHARACTERS} characters)`
  }
  return null
}

export function chunkDirectedText(raw: string) {
  const source = String(raw || '').replace(/\r\n/g, '\n').trim()
  const truncated = source.length > MAX_SUBMISSION_CHARACTERS
  const paragraphs = source
    .slice(0, MAX_SUBMISSION_CHARACTERS)
    .split(/\n{2,}/)
    .map(value => value.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > CHUNK_TARGET_CHARACTERS) {
      chunks.push(current)
      current = paragraph
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph
    }
    if (chunks.length >= MAX_CHUNKS_PER_SUBMISSION) break
  }
  if (current && chunks.length < MAX_CHUNKS_PER_SUBMISSION) chunks.push(current)
  return { chunks, truncated: truncated || chunks.length >= MAX_CHUNKS_PER_SUBMISSION }
}

export const directedContentHash = (uri: string, chunk: string) =>
  createHash('sha256').update(`directed:${clean(uri)}:${chunk}`).digest('hex')

/**
 * Owner-directed study has a different relevance authority from autonomous discovery.
 *
 * Autonomous learning must prove that discovered material is relevant before retaining it.
 * Directed Study is an explicit owner instruction to retain/study a supplied source, so the
 * owner's topic + study intent establish relevance. The autonomous lexical relevance scorer is
 * still run and returned as diagnostic telemetry (`coverage`, `matchedTerms`, `intentAligned`),
 * but it cannot veto a substantive owner-directed chunk. This is especially important for
 * multilingual and literary material where keyword overlap is a poor proxy for semantic value.
 *
 * Provenance/license/size/duplicate/storage controls remain enforced elsewhere in the directed
 * study path. Retrieval still decides whether this retained material is relevant to a later query.
 */
export function assessDirectedStudy(submission: DirectedStudySubmission, gates: DirectedStudyGates): DirectedStudyAssessment {
  const subject = clean(submission.topic).slice(0, 180)
  const invalid = validateDirectedSubmission(submission)
  if (invalid) return { ok: false, error: invalid, sourceKind: null, subject, chunks: [], admitted: 0, rejected: 0 }

  const anchors = gates.distinctTerms(subject).slice(0, 8)
  const anchorSet = new Set(anchors)
  const terms = {
    anchors,
    supporting: gates.distinctTerms(clean(submission.studyIntent)).filter(term => !anchorSet.has(term)).slice(0, 12),
  }
  const sourceKind = DIRECTED_SOURCE_KIND[submission.materialKind]

  const chunks = chunkDirectedText(submission.text).chunks.map((chunk, index): DirectedChunkVerdict => {
    const contentHash = directedContentHash(submission.sourceUri, chunk)
    if (chunk.length < MINIMUM_CHUNK_CHARACTERS) {
      return {
        index,
        contentHash,
        admitted: false,
        reason: 'too_short',
        confidence: 0,
        coverage: 0,
        matchedTerms: [],
        intentAligned: false,
        admissionBasis: 'owner_directed_intent',
        summary: '',
      }
    }

    const document: LearningSourceDocument = {
      sourceKind,
      sourceUri: clean(submission.sourceUri).slice(0, 700),
      sourceTitle: clean(submission.sourceTitle) || undefined,
      observedAt: submission.observedAt || undefined,
      subject,
      text: chunk,
      license: clean(submission.license).slice(0, 300),
    }

    const score = gates.relevanceOf(document, terms)
    const intentAligned = gates.sourceAwareRelevant(document, score, terms)
    const confidence = Math.max(0, Math.min(0.92, gates.candidate0Confidence(document, score)))

    return {
      index,
      contentHash,
      admitted: true,
      reason: 'admitted_owner_directed',
      confidence,
      coverage: Number(score.coverage.toFixed(3)),
      matchedTerms: [...score.anchorsMatched, ...score.supportingMatched].slice(0, 12),
      intentAligned,
      admissionBasis: 'owner_directed_intent',
      summary: clean(chunk).slice(0, 1500),
    }
  })

  const admitted = chunks.filter(chunk => chunk.admitted).length
  return { ok: true, sourceKind, subject, chunks, admitted, rejected: chunks.length - admitted }
}

export function directedEvidence(submission: DirectedStudySubmission) {
  return [
    'owner_directed_study',
    'admission_basis:owner_directed_intent',
    `submitted_by:${clean(submission.submittedBy || 'owner').slice(0, 120)}`,
    `study_intent:${clean(submission.studyIntent).slice(0, 300)}`,
    `material_kind:${submission.materialKind}`,
  ]
}
