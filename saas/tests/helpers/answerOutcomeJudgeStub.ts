// saas/tests/helpers/answerOutcomeJudgeStub.ts
// A stand-in for the verifier's model judge in tests. It speaks the judge's protocol (deliverables with quotes) for a
// request with numbered deliverables: a section of the answer numbered like the deliverable, whose text (heading line
// included) has at least eight words, is reported delivered with its last eight words as the quote. The host-side checks in
// answerOutcomeVerifier.ts (quote must be in the answer) still run on its output, exactly as on a real judge's.
import { requestedAnalyticalTasks } from '../../lib/ai/cos/answerTaskContract.ts'
import type { AnswerOutcomeJudge } from '../../lib/ai/cos/answerOutcomeVerifier.ts'

export function sectionBody(answer: string, number: number): string {
  const lines = String(answer || '').split('\n')
  const start = lines.findIndex(line => new RegExp(`^\\s*(?:#{1,6}\\s*)?${number}[.)]\\s`).test(line))
  if (start < 0) return ''
  const rest: string[] = [lines[start].replace(/^\s*(?:#{1,6}\s*)?\d{1,2}[.)]\s+/, '')]
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(?:#{1,6}\s*)?\d{1,2}[.)]\s/.test(line)) break
    rest.push(line)
  }
  return rest.join(' ').replace(/\s+/g, ' ').trim()
}

export const stubOutcomeJudge: AnswerOutcomeJudge = async (request, answer) => JSON.stringify({
  deliverables: requestedAnalyticalTasks(request).map((item, index) => {
    const words = sectionBody(answer, index + 1).split(' ').filter(Boolean)
    return words.length >= 8
      ? { item, delivered: true, quote: words.slice(-8).join(' ') }
      : { item, delivered: false, quote: '' }
  }),
})

/** A judge that could not run (outage, timeout). */
export const unavailableOutcomeJudge: AnswerOutcomeJudge = async () => null
