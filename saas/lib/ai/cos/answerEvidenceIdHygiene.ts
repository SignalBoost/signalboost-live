// saas/lib/ai/cos/answerEvidenceIdHygiene.ts
//
// INTERNAL EVIDENCE IDS ARE PROMPT SCAFFOLDING, NOT ANSWER CONTENT.
//
// Retrieved corpus rows are injected into the reasoning prompt labelled `[CL1] … [CL6]`, and live
// search evidence as `[LIVE1] …`. Those labels exist so the reasoner can cite precisely and so the
// server can verify what was actually used. They are meaningless to the person reading the answer.
//
// Production failure, 2026-08-22: asked to render a video with provider failover, COS replied that
// "the provided evidence corpus [CL1–CL6] does not contain information regarding 'Provider X'".
// The user was shown internal retrieval identifiers and a paragraph about the shape of COS's own
// prompt — a leak of implementation detail into what should be a plain answer, and confusing to
// anyone who does not know what CL means.
//
// The rule this module enforces: a citation marker survives ONLY when the answer also gives the
// reader something real to follow — a source URL rendered alongside it. Otherwise the marker is
// scaffolding and is removed. Sentences whose entire content is a complaint about the evidence
// corpus are removed as well: "my prompt did not contain X" is never useful to a user, and when
// the corpus genuinely lacked what was needed, the honest sentence is "I don't have that", which
// the answer policies already require elsewhere.
//
// Deliberately NOT a rewriter: it removes markers and whole scaffolding sentences, and never
// paraphrases, reorders, or invents. If stripping would empty the answer, the original is kept —
// a mangled answer is worse than a leaky one.
//
// Pure, deterministic, dependency-free.

/** `[CL1]`, `[CL 12]`, `[LIVE3]`, and en-dash ranges such as `[CL1–CL6]`. */
// Every marker family minted into COS prompts, verified against the codebase rather than guessed:
// CL (learned corpus), LIVE (live search), KG (knowledge graph), EM / OEM (enterprise and
// organization memory), UM (user memory), SK (cognitive skills), MEMBER (org member records).
// OEM was missing from the first version of this guard and leaked to a user on 2026-08-22 —
// keep this list in sync with the prompt builders; a family absent here is a family that leaks.
const MARKER_FAMILY = '(?:OEM|MEMBER|LIVE|CL|KG|EM|UM|SK)'
const EVIDENCE_MARKER = new RegExp(`\\[\\s*${MARKER_FAMILY}\\s*\\d+(?:\\s*[–—-]\\s*${MARKER_FAMILY}?\\s*\\d+)?\\s*\\]`, 'gi')

/** Sentences that talk ABOUT the prompt's evidence block rather than answering the question. */
const SCAFFOLDING_SENTENCE = /(?:^|[.!?]\s+)[^.!?]*\b(?:provided|supplied|available|given)?\s*evidence\s+corpus\b[^.!?]*[.!?]/gi
const SCAFFOLDING_SENTENCE_ALT = /(?:^|[.!?]\s+)[^.!?]*\b(?:the\s+)?(?:supplied|provided|given)\s+context\b[^.!?]*\b(?:does\s+not|lacks?|contains?\s+no)\b[^.!?]*[.!?]/gi

function hasFollowableSource(text: string): boolean {
  return /https?:\/\/\S+/i.test(text)
}

/**
 * Remove internal evidence identifiers and evidence-block commentary from a user-facing answer.
 * Markers are preserved when the answer also renders real source URLs, because in that case they
 * are functioning as citation keys the reader can actually follow.
 */
export function stripInternalEvidenceIds(answer: string): string {
  const original = String(answer || '')
  if (!original.trim()) return original
  if (hasFollowableSource(original)) return original

  let cleaned = original.replace(SCAFFOLDING_SENTENCE, ' ').replace(SCAFFOLDING_SENTENCE_ALT, ' ')

  // Parenthetical groups that are nothing but markers go entirely: "Memory ([OEM1], [OEM2])
  // contains…" must not become "Memory (, ) contains…".
  cleaned = cleaned.replace(
    new RegExp(`[\\s]*\\(\\s*(?:${MARKER_FAMILY}\\s*\\d+\\s*[,;]?\\s*|\\[\\s*${MARKER_FAMILY}\\s*\\d+\\s*\\]\\s*[,;]?\\s*)+\\)`, 'gi'),
    '',
  )

  // A marker used as a grammatical subject cannot simply vanish — "While [OEM1] shows…" would
  // become "While shows…". Replace those with a neutral, accurate phrase; markers that merely
  // trail a clause are removed outright.
  cleaned = cleaned.replace(EVIDENCE_MARKER, (match, offset: number, whole: string) => {
    const text = String(whole)
    const after = text.slice(offset + String(match).length)
    if (!/^\s*[\p{L}\p{N}]/u.test(after)) return ''
    // A marker in APPOSITION after a noun ("The strategy profile [OEM1] instructs…") is removed —
    // the noun is the subject and replacement would double it ("the profile the retrieved evidence
    // instructs", observed in production 2026-08-23). Only a marker that IS the subject — sentence
    // start or right after a conjunction/preposition ("While [OEM1] shows…") — takes the neutral
    // phrase.
    const before = text.slice(Math.max(0, offset - 40), offset)
    const markerIsSubject = /(?:^|[.!?:;]\s*|\n\s*|\b(?:while|because|since|although|though|whereas|and|but|or|as|if|when|per|according\s+to|from|in|of|by|that)\s+)$/iu.test(before)
    return markerIsSubject ? 'the retrieved evidence' : ''
  })
  cleaned = cleaned
    // A removed trailing marker can strand its conjunction: "Point two X and ." → "Point two X."
    .replace(/\s+(?:and|or|y|e|i|и|oraz)\s*([.;,!?])/gi, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Never hand back an empty or gutted answer: if stripping removed nearly everything, the
  // original is the lesser evil and the caller can see it unchanged.
  if (cleaned.length < Math.min(40, original.trim().length * 0.4)) return original
  return cleaned
}

/** True when an answer exposes internal retrieval identifiers without any followable source. */
export function leaksInternalEvidenceIds(answer: string): boolean {
  const text = String(answer || '')
  if (!text.trim() || hasFollowableSource(text)) return false
  EVIDENCE_MARKER.lastIndex = 0
  return EVIDENCE_MARKER.test(text)
}
