// saas/lib/ai/cos/contentGenerationIntent.ts
//
// Authoring and transforming user-supplied material create or modify an artifact; they are not
// current-world factual lookups. This classifier exists so requests such as "write me X",
// "edit this email", "summarize this text", or "translate this paragraph" are never hijacked
// into live web retrieval and then failed closed for evidence they never needed.
//
// WHY THE ANCHOR MOVED (2026-08-23): the pattern was anchored to the start of the WHOLE prompt, so
// the authoring verb had to be the very first word. Real executive requests state the situation
// first and ask last:
//
//   "Gross margins have declined from 74% to 61% ... The Head of AI wants to maintain the CURRENT
//    premium model tier ... Design a 90-day phased optimization strategy ..."
//
// The verb "Design" sits in the third sentence, so the exclusion never fired; the word "current" —
// a possessive adjective describing the company's OWN internal tier, not a current-world fact —
// then routed the whole thing to live evidence, which came back unavailable and the user got a
// refusal instead of a strategy.
//
// The verb must still LEAD ITS OWN CLAUSE — that separates a real instruction ("design a strategy")
// from an incidental mention ("who designed the Eiffel Tower"). Unicode-aware boundaries are used
// so Polish and Russian commands are treated the same way as English, Spanish, and Portuguese.

const AUTHORING_VERB = [
  // English
  'write', 'draft', 'create', 'generate', 'design', 'produce',
  'edit', 'rewrite', 'proofread', 'polish', 'rephrase', 'shorten', 'tighten', 'summarize', 'summarise', 'translate',
  // Spanish
  'escribe', 'redacta', 'crea', 'edita', 'reescribe', 'revisa', 'corrige', 'resume', 'traduce',
  // Portuguese
  'escreva', 'redija', 'crie', 'edite', 'reescreva', 'revise', 'corrija', 'resuma', 'traduza',
  // Polish
  'napisz', 'stw[oó]rz', 'zaprojektuj', 'edytuj', 'przeredaguj', 'zredaguj', 'popraw', 'skr[oó][ćc]', 'stre[sś][ćc]', 'przet[lł]umacz',
  // Russian
  'напиши', 'создай', 'сгенерируй', 'отредактируй', 'перепиши', 'исправь', 'улучши', 'сократи', 'резюмируй', 'переведи',
].join('|')

/** Matches an authoring/transformation verb at the start of the string. */
const GENERATION = new RegExp(`^\\s*(?:${AUTHORING_VERB})(?![\\p{L}\\p{N}_])`, 'iu')

/**
 * Split on sentence terminators and on clause boundaries that commonly precede an instruction
 * ("..., so design a plan", "... — draft the memo", "and then write the summary"). Newlines and
 * bullet markers count too, since briefs are often written as lists.
 */
function clausesOf(input: string): string[] {
  return input
    .split(/(?:[.!?;:]|\n+|—|--|\band then\b|\bso\b(?=\s)|\bthen\b(?=\s)|^\s*[-*•]\s*)/iu)
    .map(part => part.trim())
    // A role prefix frames the requested artifact; it must not hide the authoring verb.
    .flatMap(part => {
      const stripped = part.replace(/^(?:as|acting\s+as|in\s+(?:your|the)\s+role\s+as|in\s+your\s+capacity\s+as|como|na\s+qualidade\s+de|jako|как)(?![\p{L}\p{N}_])[^,]{0,60},\s*/iu, '')
      return stripped !== part ? [part, stripped] : [part]
    })
    .filter(Boolean)
}

/**
 * True when any clause is an instruction to author or transform supplied material. Checking per
 * clause rather than per prompt lets a request that supplies context first still be recognized.
 */
export function isContentGenerationRequest(input: string): boolean {
  const text = String(input || '').trim()
  if (!text) return false
  if (GENERATION.test(text)) return true
  return clausesOf(text).some(clause => GENERATION.test(clause))
}
