// Internal retrieval labels are reasoning scaffolding, never user-facing prose.
// Keep them only when the answer gives the reader a real source URL to follow.

const EVIDENCE_MARKER = /\\[\\s*(?:CL|LIVE|KG|EM|UM|SK)\\s*\\d+(?:\\s*[–—-]\\s*(?:CL|LIVE|KG|EM|UM|SK)?\\s*\\d+)?\\s*\\]/gi
const SCAFFOLDING_SENTENCE = /(?:^|[.!?]\\s+)[^.!?]*\\b(?:provided|supplied|available|given)?\\s*evidence\\s+corpus\\b[^.!?]*[.!?]/gi
const SCAFFOLDING_SENTENCE_ALT = /(?:^|[.!?]\\s+)[^.!?]*\\b(?:the\\s+)?(?:supplied|provided|given)\\s+context\\b[^.!?]*\\b(?:does\\s+not|lacks?|contains?\\s+no)\\b[^.!?]*[.!?]/gi
function hasFollowableSource(text: string): boolean { return /https?:\\/\\/\\S+/i.test(text) }
export function stripInternalEvidenceIds(answer: string): string {
  const original = String(answer || '')
  if (!original.trim() || hasFollowableSource(original)) return original
  const cleaned = original.replace(SCAFFOLDING_SENTENCE, ' ').replace(SCAFFOLDING_SENTENCE_ALT, ' ').replace(EVIDENCE_MARKER, '').replace(/[ \\t]{2,}/g, ' ').replace(/\\s+([.,;:!?])/g, '$1').replace(/\\(\\s*\\)/g, '').replace(/\\n{3,}/g, '\\n\\n').trim()
  return cleaned.length < Math.min(40, original.trim().length * 0.4) ? original : cleaned
}
export function leaksInternalEvidenceIds(answer: string): boolean {
  const text = String(answer || '')
  if (!text.trim() || hasFollowableSource(text)) return false
  EVIDENCE_MARKER.lastIndex = 0
  return EVIDENCE_MARKER.test(text)
}
