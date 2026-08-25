// saas/lib/ai/cos/artifactContinuationIntent.ts
// Pure intent classifier for conversational writing follow-ups. Keep this module free of Node-only
// state so freshness/content-generation policy can import it safely.

const SUBJECT_OR_TITLE_FOLLOWUP = /\b(?:subject(?:\s+line)?|title|headline|caption)\b.{0,60}\b(?:this|that|the|previous|prior|above|same|e-?mail|message|draft|letter|memo|text|reply|response)\b|\b(?:what|which)\b.{0,50}\b(?:subject(?:\s+line)?|title|headline|caption)\b/iu
const EDIT_CONTINUATION = /^\s*(?:(?:can|could|would)\s+you\s+|please\s+)?(?:make|rewrite|rephrase|shorten|tighten|polish|proofread|edit|change|add|remove|include|exclude|translate|turn|convert|use|keep)\b/iu
const TERSE_STYLE_CONTINUATION = /^\s*(?:(?:make\s+it\s+)?(?:more|less)\s+(?:formal|professional|friendly|direct|concise|diplomatic|firm|warm|polite|casual)|shorter|longer|stronger|friendlier|warmer|firmer|more\s+concise)\s*[.!?]*\s*$/iu
const ARTIFACT_DERIVATION = /\b(?:opening|closing|salutation|greeting|sign[- ]?off|subject(?:\s+line)?|title|headline|caption)\b.{0,80}\b(?:for|of)\s+(?:this|that|the|previous|prior|above|same)\s+(?:e-?mail|message|draft|letter|memo|text|reply|response)\b/iu
const EXPLICIT_FACT_VERIFICATION = /\b(?:verify|fact[- ]?check|research|look\s+up|check\s+(?:whether|if)|confirm\s+(?:whether|if)|cite\s+(?:a\s+)?source|current\s+(?:rule|law|requirement|status)|latest\s+(?:rule|law|requirement|status)|today(?:'s)?\s+(?:rule|law|requirement|status))\b/iu

function normalize(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

/**
 * True only for turns that clearly continue authoring/transforming the immediately prior artifact.
 * Merely mentioning "this email" is not enough: questions about its factual/current state must be
 * routed by their owning data/freshness policy instead of being silently treated as an edit.
 */
export function looksLikeArtifactContinuation(input: string): boolean {
  const text = normalize(input)
  if (!text || EXPLICIT_FACT_VERIFICATION.test(text)) return false
  return SUBJECT_OR_TITLE_FOLLOWUP.test(text)
    || ARTIFACT_DERIVATION.test(text)
    || EDIT_CONTINUATION.test(text)
    || TERSE_STYLE_CONTINUATION.test(text)
}
