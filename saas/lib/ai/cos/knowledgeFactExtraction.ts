//
// THE STEP THAT WAS MISSING. cos_continuous_learning holds documents COS has studied;
// cos_knowledge_facts is the subject/predicate/object store that retrieval reads. Nothing ever
// turned one into the other, so the fact table sat empty while the corpus grew — 99 documents
// studied, 0 facts known.
//
// Extraction runs on COS's OWN reasoner (LOCAL_AI_*), never on an external provider: a fact
// attributed to COS's knowledge base must have been derived by COS. The pod therefore has to be
// running for this to do anything, exactly like the study run itself.
//
// The load-bearing safety property here is GROUNDING. A model asked to "extract facts" will
// happily produce plausible ones that the document never said, and those would enter the knowledge
// base wearing a real source URI — indistinguishable from evidence, and the most damaging possible
// version of the fabrication problem. Every candidate triple is therefore checked back against the
// source text, and anything not traceable to it is dropped and counted.

import { callCosReasoner, resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import type { KnowledgeFact } from '@/lib/cos-core/layers/knowledge/persistent'
import { createHash } from 'node:crypto'

export const FACT_EXTRACTION_TASK_ID = 'continuous-learning'

export type ExtractionSourceDocument = {
  contentHash: string
  subject: string
  summary: string
  sourceUri: string
  sourceTitle?: string | null
  confidence: number
}

export type ExtractedTriple = { subject: string; predicate: string; object: string; confidence: number }

export type DocumentExtractionResult = {
  sourceUri: string
  proposed: number
  grounded: ExtractedTriple[]
  rejectedUngrounded: number
  rejectedMalformed: number
  reasonerLabel: string | null
  error?: string
}

const SYSTEM_PROMPT = [
  'You extract factual statements from a source document for a knowledge base.',
  'Return ONLY a JSON object, no preamble, no code fences, no commentary.',
  'Shape: {"facts":[{"subject":"...","predicate":"...","object":"...","confidence":0.0}]}',
  'Each fact must be a single self-contained claim the document itself makes.',
  'predicate is a short relation in snake_case, for example causes, is_diagnosed_by, requires, measures.',
  'object must paraphrase content that is present in the document. Never add knowledge from elsewhere.',
  'If the document states nothing durable and factual, return {"facts":[]}. An empty list is a valid, correct answer.',
].join('\n')

function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0, inString = false, escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1) }
  }
  return null
}

function parseFacts(raw: string): unknown[] | null {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  for (const candidate of [cleaned, extractBalancedJsonObject(cleaned)]) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate) as { facts?: unknown }
      if (Array.isArray(parsed?.facts)) return parsed.facts
    } catch { /* try the next shape */ }
  }
  return null
}

const STOP_WORDS = new Set(['about','because','been','from','have','into','more','only','over','than','that','their','them','then','there','these','they','this','when','which','while','with'])

function contentWords(text: string): string[] {
  return [...new Set(
    String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}-]+/u)
      .map(word => word.replace(/^-+|-+$/g, '').trim())
      .filter(word => word.length >= 4 && !STOP_WORDS.has(word)),
  )]
}

/**
 * Is this claim actually traceable to the document? A paraphrase legitimately rewords, so exact
 * substring matching would reject almost everything real — but a claim the source never made will
 * share very little vocabulary with it. The bar is a share of the object's content words, tunable
 * because it trades fabrication risk against paraphrase freedom.
 */
export function groundingScore(object: string, sourceText: string): number {
  const words = contentWords(object)
  if (!words.length) return 0
  const haystack = ` ${String(sourceText ?? '').toLowerCase()} `
  const present = words.filter(word => haystack.includes(word))
  return present.length / words.length
}

export function minimumGrounding(): number {
  const raw = Number(process.env.COS_FACT_GROUNDING_THRESHOLD)
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.6
}

/** Deterministic id so re-extracting the same document updates rather than duplicates. */
export function factId(taskId: string, subject: string, predicate: string): string {
  return createHash('sha256').update(`${taskId}\n${subject}\n${predicate}`).digest('hex').slice(0, 40)
}

export function toKnowledgeFact(triple: ExtractedTriple, sourceUri: string, now = new Date()): KnowledgeFact {
  const subject = triple.subject.trim().slice(0, 300)
  const predicate = triple.predicate.trim().slice(0, 120)
  return {
    id: factId(FACT_EXTRACTION_TASK_ID, subject, predicate),
    taskId: FACT_EXTRACTION_TASK_ID,
    subject,
    predicate,
    object: triple.object.trim().slice(0, 2000),
    confidence: triple.confidence,
    source: sourceUri,
    updatedAt: now,
  }
}

/**
 * Ask COS's reasoner for the durable claims in one studied document, then keep only the ones the
 * document supports. A fact can never be more confident than the admission confidence of the
 * document it came from — knowledge does not become truer by being restated.
 */
export async function extractFactsFromDocument(document: ExtractionSourceDocument): Promise<DocumentExtractionResult> {
  const base: DocumentExtractionResult = { sourceUri: document.sourceUri, proposed: 0, grounded: [], rejectedUngrounded: 0, rejectedMalformed: 0, reasonerLabel: null }
  const source = document.summary?.trim()
  if (!source) return { ...base, error: 'document has no stored excerpt to extract from' }

  const prompt = [
    `Subject area: ${document.subject}`,
    document.sourceTitle ? `Document title: ${document.sourceTitle}` : '',
    'Document:',
    source,
  ].filter(Boolean).join('\n')

  const answer = await callCosReasoner({ prompt, systemPrompt: SYSTEM_PROMPT, maxTokens: 1500, temperature: 0 })
  if (!answer) {
    const resolved = resolveCosReasoner()
    return { ...base, error: 'config' in resolved && resolved.config ? 'COS reasoner did not answer' : (resolved as { reason: string }).reason }
  }

  const parsed = parseFacts(answer.text)
  if (!parsed) {
    console.error('cosFactExtraction: reasoner output was not parseable JSON', { sourceUri: document.sourceUri, excerpt: answer.text.slice(0, 240) })
    return { ...base, reasonerLabel: answer.reasoner.label, error: 'reasoner output was not parseable JSON' }
  }

  const floor = minimumGrounding()
  const result: DocumentExtractionResult = { ...base, proposed: parsed.length, reasonerLabel: answer.reasoner.label }

  for (const entry of parsed) {
    const row = entry as { subject?: unknown; predicate?: unknown; object?: unknown; confidence?: unknown }
    const subject = typeof row.subject === 'string' ? row.subject.trim() : ''
    const predicate = typeof row.predicate === 'string' ? row.predicate.trim() : ''
    const object = typeof row.object === 'string' ? row.object.trim() : ''
    if (!subject || !predicate || object.length < 8) { result.rejectedMalformed += 1; continue }

    const grounding = groundingScore(object, source)
    if (grounding < floor) {
      result.rejectedUngrounded += 1
      console.warn('cosFactExtraction: claim not grounded in its source, dropped', { sourceUri: document.sourceUri, subject, predicate, grounding: Number(grounding.toFixed(2)), floor })
      continue
    }

    const claimed = Number(row.confidence)
    const bounded = Number.isFinite(claimed) ? Math.max(0, Math.min(1, claimed)) : document.confidence
    const confidence = Number(Math.min(bounded * grounding, document.confidence).toFixed(2))
    if (confidence <= 0) { result.rejectedMalformed += 1; continue }

    result.grounded.push({ subject, predicate, object, confidence })
  }

  return result
}

/**
 * Which studied documents to extract from next. Documents whose source URI already appears in the
 * fact table are skipped unless a re-extraction is explicitly asked for, and documents with no
 * stored excerpt are never selected because there is nothing to ground a claim against.
 */
export function resolveExtractionBatch(
  documents: ExtractionSourceDocument[],
  alreadyExtracted: Set<string>,
  limit: number,
  reextract = false,
): ExtractionSourceDocument[] {
  return documents
    .filter(document => document.sourceUri && document.summary.trim())
    .filter(document => reextract || !alreadyExtracted.has(document.sourceUri))
    .slice(0, Math.max(1, limit))
}
