// saas/lib/ai/cos/artifactContinuationIntent.ts
// Pure intent classifier for conversational writing follow-ups. Keep this module free of Node-only
// state so freshness/content-generation policy can import it safely.

const ARTIFACT_NOUN = '(?:e-?mail|message|draft|letter|memo|text|paragraph|response|reply|note|document|post|version)'
const ARTIFACT_PART = '(?:subject\\s+line|title|headline|caption|opening|closing|salutation|greeting|sign[- ]?off|sentence|paragraph|wording|tone|style|meaning|format|e-?mail|message|draft|letter|memo|text|reply|response)'
const PRIOR_REFERENCE = '(?:this|that|the|previous|prior|above|same)'

const SUBJECT_LINE_FOLLOWUP = new RegExp(
  `\\b(?:subject\\s+line|headline|caption)\\b.{0,80}\\b(?:for|of)\\s+${PRIOR_REFERENCE}\\s+${ARTIFACT_NOUN}\\b`
    + '|\\b(?:what|which)\\b.{0,40}\\b(?:subject\\s+line|headline|caption)\\b'
    + '|\\bwhat\\s+would\\s+(?:the\\s+)?(?:subject\\s+line|headline|caption)\\s+be\\b',
  'iu',
)

// "Title" is ambiguous: "the title of the current president" is a factual lookup, while
// "a title for this memo" continues an artifact. Require an artifact reference or hypothetical
// wording rather than treating every question containing "title" as authoring.
const TITLE_FOLLOWUP = new RegExp(
  `\\btitle\\b.{0,80}\\b(?:for|of)\\s+${PRIOR_REFERENCE}\\s+${ARTIFACT_NOUN}\\b`
    + '|\\bwhat\\s+would\\s+(?:the\\s+)?title\\s+be\\b',
  'iu',
)

const DIRECT_EDIT_CONTINUATION = /^\s*(?:(?:can|could|would)\s+you\s+|please\s+)?(?:rewrite|rephrase|shorten|tighten|polish|proofread|edit|translate)\b/iu
const STYLE_EDIT_CONTINUATION = /^\s*(?:(?:can|could|would)\s+you\s+|please\s+)?(?:make|change)\s+(?:it|this|that|the\s+(?:e-?mail|message|draft|letter|memo|text|reply|response))\s+(?:more|less)\s+(?:formal|professional|friendly|direct|concise|diplomatic|firm|warm|polite|casual|clear|clearer)\b/iu
const STRUCTURAL_EDIT_CONTINUATION = new RegExp(
  `^\\s*(?:(?:can|could|would)\\s+you\\s+|please\\s+)?(?:add|remove|include|exclude|change|use|keep|turn|convert)\\b.{0,80}\\b${ARTIFACT_PART}\\b`,
  'iu',
)
const TERSE_STYLE_CONTINUATION = /^\s*(?:(?:make\s+it\s+)?(?:more|less)\s+(?:formal|professional|friendly|direct|concise|diplomatic|firm|warm|polite|casual)|shorter|longer|stronger|friendlier|warmer|firmer|more\s+concise)\s*[.!?]*\s*$/iu
const ARTIFACT_DERIVATION = new RegExp(
  `\\b(?:opening|closing|salutation|greeting|sign[- ]?off|subject\\s+line|title|headline|caption)\\b.{0,80}\\b(?:for|of)\\s+${PRIOR_REFERENCE}\\s+${ARTIFACT_NOUN}\\b`,
  'iu',
)

const LEADING_ARTIFACT_COMMAND = /^\s*(?:(?:can|could|would)\s+you\s+|please\s+)?(?:rewrite|rephrase|shorten|tighten|polish|proofread|edit|translate|make|change|add|remove|include|exclude|use|keep|turn|convert)\b/iu
const LOOKUP_START = /^\s*(?:what|which|show|give|tell(?:\s+me)?|find|is|are)\b/iu
const TEMPORAL_HEADING_LOOKUP = /\b(?:current|latest|today(?:'s)?|tonight|live|breaking|news)\b.{0,80}\b(?:headline|title|caption)\b|\b(?:headline|title|caption)\b.{0,80}\b(?:current|latest|today(?:'s)?|tonight|live|breaking|news)\b/iu
const EXPLICIT_FACT_VERIFICATION = /\b(?:verify|fact[- ]?check|research|look\s+up|check\s+(?:whether|if)|confirm\s+(?:whether|if)|cite\s+(?:a\s+)?source|current\s+(?:rule|law|requirement|status)|latest\s+(?:rule|law|requirement|status)|today(?:'s)?\s+(?:rule|law|requirement|status))\b/iu
const ARTIFACT_STATE_LOOKUP = new RegExp(
  `\\b(?:status|delivery|delivered|sent|received|opened|tracked)\\b.{0,60}\\b${PRIOR_REFERENCE}\\s+(?:e-?mail|message)\\b`
    + `|\\b${PRIOR_REFERENCE}\\s+(?:e-?mail|message)\\b.{0,60}\\b(?:status|delivery|delivered|sent|received|opened|tracked)\\b`,
  'iu',
)

function normalize(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

/**
 * A fresh inline source belongs to the current request, not to the previous assistant artifact.
 * Detect the delimiters accepted by the direct text-transformation parser before whitespace
 * normalization erases them.
 */
function suppliesInlineSource(input: string): boolean {
  const raw = String(input || '').trim()
  const command = raw.match(LEADING_ARTIFACT_COMMAND)
  if (!command) return false

  const tail = raw.slice(command[0].length)
  const delimited = tail.match(/^(?:[^:\n]{0,100}?)(?::|\n+|\s[-–—]\s)([\s\S]+)$/u)
  return Boolean(delimited && delimited[1].trim().length >= 8)
}

/**
 * True only for turns that clearly continue authoring/transforming the immediately prior artifact.
 * Merely mentioning an email or the word "title" is not enough: factual/current-state questions
 * must remain under their owning data and freshness policies.
 */
export function looksLikeArtifactContinuation(input: string): boolean {
  const raw = String(input || '').trim()
  const text = normalize(raw)
  if (!text || suppliesInlineSource(raw)) return false
  if (EXPLICIT_FACT_VERIFICATION.test(text) || ARTIFACT_STATE_LOOKUP.test(text)) return false
  if (LOOKUP_START.test(text) && TEMPORAL_HEADING_LOOKUP.test(text)) return false
  return SUBJECT_LINE_FOLLOWUP.test(text)
    || TITLE_FOLLOWUP.test(text)
    || ARTIFACT_DERIVATION.test(text)
    || DIRECT_EDIT_CONTINUATION.test(text)
    || STYLE_EDIT_CONTINUATION.test(text)
    || STRUCTURAL_EDIT_CONTINUATION.test(text)
    || TERSE_STYLE_CONTINUATION.test(text)
}
