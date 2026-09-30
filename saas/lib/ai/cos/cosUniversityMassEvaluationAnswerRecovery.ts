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


/**
 * A solo retry has exactly one requested case. Production 2026-09-22 repeatedly returned finish=stop
 * with the correct END marker, while the fingerprint reported open=0 and close=1. The existing
 * missing-open recovery rejects any response containing "<<<ANSWER:", which means this shape carries
 * one malformed/foreign opener rather than no opener at all. With one requested case, exactly one
 * leading ANSWER-like opener and exactly one correct terminal closer are still unambiguous.
 *
 * Recover only that narrow wrapper shape. Thinking, truncation, multiple openers, extra END markers,
 * embedded protocol markers, empty answers and trailing text remain fail-closed.
 */
export function recoverStoppedSoloForeignOpenCorrectCloseAnswer(text: string, caseId: string, finish: string): string | null {
  if (finish !== 'stop' || /<\/?think>/i.test(text)) return null
  const close = `<<<END:${caseId}>>>`
  const closeAt = text.indexOf(close)
  if (closeAt < 0 || text.indexOf(close, closeAt + close.length) >= 0) return null
  const trailing = text.slice(closeAt + close.length).trim()
  if (/<<<(?:ANSWER|END):/i.test(trailing)) return null

  const beforeClose = text.slice(0, closeAt).trim()
  if (!beforeClose.startsWith('<<<ANSWER:')) return null
  if ((beforeClose.match(/<<<ANSWER:/g) || []).length !== 1 || /<<<END:/i.test(beforeClose)) return null

  let answer = ''
  const markerEnd = beforeClose.indexOf('>>>')
  if (markerEnd >= 0) {
    const opener = beforeClose.slice(0, markerEnd + 3)
    if (!/^<<<ANSWER:[^>\r\n]{1,120}>>>$/i.test(opener)) return null
    answer = beforeClose.slice(markerEnd + 3).trim()
  } else {
    const newlineAt = beforeClose.indexOf('\n')
    if (newlineAt < 0) return null
    const opener = beforeClose.slice(0, newlineAt).trim()
    if (!/^<<<ANSWER:[^\r\n]{1,120}$/i.test(opener)) return null
    answer = beforeClose.slice(newlineAt + 1).trim()
  }

  if (!answer || /<<<(?:ANSWER|END):/i.test(answer)) return null
  return answer
}


/**
 * A solo retry has exactly one requested case. Production 2026-09-22 returned finish=stop with the
 * correct END marker, no ANSWER marker, no other marker and no thinking text. With one requested
 * case the non-empty body immediately before that sole correct closer is unambiguous. Truncated,
 * thinking, empty, extra-marker and trailing-text responses remain fail-closed.
 */
export function recoverStoppedSoloMissingOpenAnswer(text: string, caseId: string, finish: string): string | null {
  if (finish !== 'stop' || /<\/?think>/i.test(text)) return null
  const close = `<<<END:${caseId}>>>`
  if (text.includes('<<<ANSWER:')) return null
  const closeAt = text.indexOf(close)
  if (closeAt < 0 || text.indexOf(close, closeAt + close.length) >= 0) return null
  const trailing = text.slice(closeAt + close.length).trim()
  if (/<<<(?:ANSWER|END):/i.test(trailing)) return null
  if (/<<<END:[^>\r\n]+>>>/.test(text.slice(0, closeAt))) return null
  const answer = text.slice(0, closeAt).trim()
  if (!answer || /<<<(?:ANSWER|END):[^>\r\n]+>>>/.test(answer)) return null
  return answer
}


/**
 * A solo retry may ignore the marker protocol entirely while still returning one complete answer.
 * Recover only a normal stop with non-empty plain text, no thinking block and no protocol marker at all.
 * Grouped requests, truncation and any marker-bearing ambiguity remain fail-closed.
 */
export function recoverStoppedSoloPlainAnswer(text: string, finish: string): string | null {
  if (finish !== 'stop' || /<\/?think>/i.test(text)) return null
  const answer = text.trim()
  if (!answer || /<<<(?:ANSWER|END):[^>\r\n]+>>>/.test(answer)) return null
  return answer
}


/**
 * A solo normal-stop response may contain harmless prose around one complete, correctly identified
 * ANSWER/END block. Production evaluator retries have already reduced the request to exactly one case,
 * so the block is unambiguous. Recover only when there is exactly one opener and one closer, both use
 * the requested id, generation stopped normally, and neither the answer nor surrounding text contains
 * thinking or any additional protocol marker. Truncation and multi-block output remain fail-closed.
 */
export function recoverStoppedSoloWrappedAnswer(text: string, caseId: string, finish: string): string | null {
  if (finish !== 'stop' || /<\/?think>/i.test(text)) return null
  const open = `<<<ANSWER:${caseId}>>>`
  const close = `<<<END:${caseId}>>>`
  const openAt = text.indexOf(open)
  const closeAt = text.indexOf(close, openAt + open.length)
  if (openAt < 0 || closeAt < 0) return null
  if (text.indexOf(open, openAt + open.length) >= 0 || text.indexOf(close, closeAt + close.length) >= 0) return null
  const before = text.slice(0, openAt)
  const after = text.slice(closeAt + close.length)
  if (/<<<(?:ANSWER|END):/i.test(before) || /<<<(?:ANSWER|END):/i.test(after)) return null
  const answer = text.slice(openAt + open.length, closeAt).trim()
  if (!answer || /<<<(?:ANSWER|END):/i.test(answer)) return null
  return answer
}


/**
 * A solo normal-stop retry can return the answer followed by exactly one END marker carrying a foreign id.
 * With one requested case there is no answer-to-case ambiguity. Recover only the non-empty body before that
 * sole closer; thinking, truncation, ANSWER markers, multiple END markers, embedded protocol and empty bodies
 * remain fail-closed.
 */
export function recoverStoppedSoloForeignEndAnswer(text: string, finish: string): string | null {
  if (finish !== 'stop' || /<\/?think>/i.test(text) || /<<<ANSWER:/i.test(text)) return null
  const matches = [...text.matchAll(/<<<END:([^>\r\n]{1,120})>>>/gi)]
  if (matches.length !== 1) return null
  const marker = matches[0][0]
  const at = matches[0].index ?? -1
  if (at < 0 || /<<<(?:ANSWER|END):/i.test(text.slice(at + marker.length))) return null
  const answer = text.slice(0, at).trim()
  if (!answer || /<<<(?:ANSWER|END):/i.test(answer)) return null
  return answer
}
