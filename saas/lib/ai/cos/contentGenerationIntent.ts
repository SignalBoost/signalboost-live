// saas/lib/ai/cos/contentGenerationIntent.ts
//
// Authoring creates an artifact; it is not a current-world factual lookup. This classifier exists
// so that "write me X" is never hijacked into live web retrieval and then failed closed for want
// of evidence it never needed.
//
// WHY THE ANCHOR MOVED (2026-08-23): the pattern was anchored to the start of the WHOLE prompt, so
// the authoring verb had to be the very first word. Real executive requests state the situation
// first and ask last:
//
//   "Gross margins have declined from 74% to 61% ... The Head of AI wants to maintain the CURRENT
//    premium model tier ... Design a 90-day phased optimization strategy ..."
//
// The verb "Design" sits in the third sentence, so the exclusion never fired; the word "current" —
// a possessive adjective describing the company's OWN internal tier, not a request for current
// world facts — then routed the whole thing to live evidence, which came back unavailable and the
// user got a refusal instead of a strategy. The same prompt with only the final sentence was
// classified correctly, which is what isolated the anchor as the cause.
//
// The verb must still LEAD ITS OWN CLAUSE — that is what separates a real instruction ("design a
// strategy") from an incidental mention ("who designed the Eiffel Tower", "the report writes
// well"). So instead of anchoring to the prompt, anchor to each sentence/clause and accept if any
// one of them opens with an authoring verb.

const AUTHORING_VERB = 'write|draft|create|generate|design|produce|escribe|redacta|crea|escreva|redija|crie|napisz|stw[oó]rz|zaprojektuj|напиши|создай|сгенерируй'

/** Matches an authoring verb at the start of the string. */
const GENERATION = new RegExp(`^\\s*(?:${AUTHORING_VERB})\\b`, 'iu')

/**
 * Split on sentence terminators and on clause boundaries that commonly precede an instruction
 * ("..., so design a plan", "... — draft the memo", "and then write the summary"). Newlines and
 * bullet markers count too, since briefs are often written as lists.
 */
function clausesOf(input: string): string[] {
  return input
    .split(/(?:[.!?;:]|\n+|—|--|\band then\b|\bso\b(?=\s)|\bthen\b(?=\s)|^\s*[-*•]\s*)/iu)
    .map(part => part.trim())
    .filter(Boolean)
}

/**
 * True when any clause is an instruction to author something. Checking per clause rather than per
 * prompt is what lets a request that supplies context first still be recognized as authoring.
 */
export function isContentGenerationRequest(input: string): boolean {
  const text = String(input || '').trim()
  if (!text) return false
  if (GENERATION.test(text)) return true
  return clausesOf(text).some(clause => GENERATION.test(clause))
}
