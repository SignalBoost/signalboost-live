// saas/lib/ai/cos/cosUniversityMassEvaluationAnswerRecovery.ts
// Production 2026-09-17 22:09 UTC returned finish=stop with the correct answer opener,
// no closing marker, no competing answer marker and no thinking text. The provider says
// generation completed normally, so the non-empty terminal tail is the answer. Truncated,
// thinking, empty, missing-open and marker-ambiguous responses remain fail-closed.
export function recoverStoppedOpenAnswer(text: string, caseId: string, finish: string): string | null {
  if (finish !== 'stop' || /<\/?think>/i.test(text)) return null

  const open = `<<<ANSWER:${caseId}>>>`
  const close = `<<<END:${caseId}>>>`
  const start = text.indexOf(open)
  if (start < 0 || text.indexOf(close, start + open.length) >= 0) return null

  const tail = text.slice(start + open.length).trim()
  if (!tail || /<<<(?:ANSWER|END):[^>\r\n]+>>>/.test(tail)) return null
  return tail
}


/**
 * A solo retry has exactly one requested case. Production 2026-09-20 returned finish=stop with
 * exactly one complete ANSWER/END block, but copied a different 16-hex case marker. With one requested
 * case and one complete block there is no answer-to-case ambiguity, so recover the body while keeping
 * truncated, thinking, plain-text, partial-marker and multi-block output fail-closed.
 */
export function recoverStoppedSoloMismatchedMarkerAnswer(text: string, caseId: string, finish: string): string | null {
  if (finish !== 'stop' || /<\/?think>/i.test(text)) return null
  const match = text.match(/^\s*<<<ANSWER:([0-9a-f]{16})>>>\s*([\s\S]*?)\s*<<<END:\1>>>\s*$/i)
  if (!match || match[1].toLowerCase() === caseId.toLowerCase()) return null
  const answer = match[2].trim()
  if (!answer || /<<<(?:ANSWER|END):[^>\r\n]+>>>/.test(answer)) return null
  return answer
}
