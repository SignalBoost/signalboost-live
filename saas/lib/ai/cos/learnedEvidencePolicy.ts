// saas/lib/ai/cos/learnedEvidencePolicy.ts
//
// When must a COS answer demonstrably USE retrieved full-content learned-corpus evidence?
//
// A retrieved row may be useful context without being material enough to veto an otherwise sound
// answer. Production failures on 2026-08-25 showed why this distinction matters: a loosely related
// full-content row was selected for a quantitative H100 migration question; COS answered locally,
// then the release gate discarded the answer solely because the row was not cited. Retrieval is an
// aid, not authority by mere selection.
//
// Rule:
//   1. artifact composition remains exempt;
//   2. metadata pointers never create a citation obligation;
//   3. full-content evidence creates a hard citation obligation only when it is strongly relevant
//      AND shares concrete lexical anchors with the actual request.
//
// We deliberately keep the hard-evidence threshold above the ordinary injection threshold. A row
// can therefore be consulted/injected as potentially useful context without becoming a mandatory
// material contributor. Provenance can honestly report such rows as consulted but not material.

import { isContentGenerationRequest } from './contentGenerationIntent.ts'

/** Marker used by retrieval when a learned-corpus row was injected with its full content. */
const FULL_CONTENT_MARKER = 'retrieved content'
const DEFAULT_REQUIRED_SIMILARITY = 0.72
const MIN_MATERIAL_SHARED_TERMS = 3

const MATERIAL_STOP = new Set([
  'about','after','again','also','answer','because','before','being','between','could','data','define',
  'does','from','general','have','into','knowledge','model','models','more','most','need','needed','only',
  'question','should','system','systems','that','their','there','these','they','this','those','through',
  'under','using','what','when','where','which','while','with','would','your','you','and','the','for','are',
  'how','why','versus','calculate','compute','explain','training','pretraining','llm','ai',
])

function requiredSimilarity(): number {
  const configured = Number(process.env.COS_LEARNED_EVIDENCE_REQUIRED_SIMILARITY || DEFAULT_REQUIRED_SIMILARITY)
  return Number.isFinite(configured) ? Math.max(0.55, Math.min(0.95, configured)) : DEFAULT_REQUIRED_SIMILARITY
}

function materialTerms(text: string): string[] {
  return [...new Set(
    String(text ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
      .split(/\s+/)
      .map(term => term.replace(/^-+|-+$/g, '').trim())
      .filter(term => term.length >= 4 && !MATERIAL_STOP.has(term)),
  )]
}

function recordedSimilarity(item: string): number | null {
  const match = String(item ?? '').match(/\b(?:similarity|relevance)\s+([01](?:\.\d+)?)\b/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

/**
 * A full-content row is material enough to impose a citation requirement only when retrieval
 * confidence is strong and the row shares several concrete terms with the request. This blocks
 * broad same-domain matches ("AI", "training", "networking") from becoming fail-closed vetoes.
 */
export function learnedEvidenceMateriallyMatchesPrompt(prompt: string, item: string): boolean {
  if (!String(item ?? '').includes(FULL_CONTENT_MARKER)) return false
  const promptTerms = materialTerms(prompt)
  const itemTerms = new Set(materialTerms(item))
  const shared = promptTerms.filter(term => itemTerms.has(term))
  if (shared.length < MIN_MATERIAL_SHARED_TERMS) return false

  const similarity = recordedSimilarity(item)
  // Legacy/fixture strings may predate similarity annotations. Require an even stronger lexical
  // match rather than treating missing telemetry as automatically material.
  if (similarity === null) return shared.length >= MIN_MATERIAL_SHARED_TERMS + 1
  return similarity >= requiredSimilarity()
}

/**
 * True when the release gate should require material use (a [CL#] citation) of retrieved
 * full-content learned evidence for this prompt.
 */
export function learnedEvidenceUseRequired(prompt: string, learnedContextItems: readonly string[]): boolean {
  if (isContentGenerationRequest(String(prompt ?? ''))) return false
  return learnedContextItems.some(item => learnedEvidenceMateriallyMatchesPrompt(String(prompt ?? ''), String(item ?? '')))
}
