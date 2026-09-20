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
