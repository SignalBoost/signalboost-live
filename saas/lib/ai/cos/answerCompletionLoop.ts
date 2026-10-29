// saas/lib/ai/cos/answerCompletionLoop.ts
//
// THE ANSWER LOOP (2026-10-26). A COS answer used to be one pass: draft, one repair, release. Nothing asked "did this
// answer deliver everything the person asked for?" before it was released, and nothing went around again while time
// remained. This is the observe -> check -> act -> check loop harness engineering prescribes (LangChain's
// Terminal-Bench harness: check the work against the task before finishing; stop a loop that makes no progress):
//
//   1. Check: list what the request asked for that the answer does not yet deliver. The independent verifier
//      (answerOutcomeVerifier.ts) reads the whole request and answer and must quote the evidence for each deliverable.
//   2. Act: write only the missing parts, appended to the answer (nothing already written is rewritten or lost).
//   3. Repeat at most three rounds, and only while the turn has time for a check and a completion.
//   4. Stop as soon as nothing is missing, a round makes no progress, the checker is unavailable, or time runs out.
//
// The loop never invents completion: the answer it returns is the original answer plus whatever was really written.

export const ANSWER_COMPLETION_MAX_ROUNDS = 3
/** Time one round needs: a short check plus writing the missing parts. */
export const ANSWER_COMPLETION_ROUND_RESERVE_MS = 30_000

export type AnswerCompletionStop = 'complete' | 'no_progress' | 'budget' | 'max_rounds' | 'checker_unavailable' | 'completion_unavailable'

export type AnswerCompletionResult = Readonly<{
  answer: string
  rounds: number
  missing: readonly string[]
  stopped: AnswerCompletionStop
}>

export type AnswerCompletionPorts = Readonly<{
  /** What the request asked for that the answer does not yet deliver; null when the check could not run. */
  check: (request: string, answer: string) => Promise<readonly string[] | null>
  /** Only the missing parts, written to follow the existing answer; null or empty when nothing was written. */
  complete: (request: string, answer: string, missing: readonly string[]) => Promise<string | null>
  remainingMs: () => number
  /** Optional trusted host verifier (existing test runner, linter, schema validator); never an LLM-supplied shell string. */
  verify?: (request: string, answer: string) => Promise<{ passed: boolean; failures: readonly string[] } | null>
  /** Durable receipt hook; failures fail closed rather than claiming success. */
  persistVerification?: (receipt: { round: number; passed: boolean; failures: readonly string[] }) => Promise<void>
}>

function unique(items: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const value = String(item || '').trim().replace(/\s+/g, ' ').slice(0, 300)
    const key = value.toLowerCase()
    if (value && !seen.has(key)) { seen.add(key); out.push(value) }
  }
  return out
}

export async function runAnswerCompletionLoop(input: Readonly<{
  request: string
  answer: string
  ports: AnswerCompletionPorts
  maxRounds?: number
  roundReserveMs?: number
}>): Promise<AnswerCompletionResult> {
  const maxRounds = Math.max(0, Math.min(ANSWER_COMPLETION_MAX_ROUNDS, input.maxRounds ?? ANSWER_COMPLETION_MAX_ROUNDS))
  const reserve = Math.max(0, input.roundReserveMs ?? ANSWER_COMPLETION_ROUND_RESERVE_MS)
  let answer = String(input.answer || '')
  // ONLY A VERIFIED ADDITION IS KEPT. A completion round's text joins the answer only once the next check shows it
  // closed at least one gap; a round that closed nothing, or was never checked (time ran out), is dropped and the
  // last accepted answer is returned. Production 2026-10-27 17:16 UTC: a round wrote a six-line critique of the
  // answer ("1. The answer fails to execute…") instead of content, the next check found as much missing as before,
  // and the loop returned the answer with the critique pasted at the end.
  let accepted = answer
  let previousMissing: number | null = null
  let missing: string[] = []
  for (let round = 0; ; round++) {
    // Reserve time for optional repair, not the initial answer check. Otherwise a
    // completed draft is rejected before either checker or trusted verifier runs.
    if (input.ports.remainingMs() <= 0) return { answer: accepted, rounds: round, missing, stopped: 'budget' }
    const checked = await input.ports.check(input.request, answer).catch(() => null)
    if (checked === null) {
      // A model-checker outage is not a finding that the answer is incomplete.
      // A trusted host verifier can still certify it, but an absent verifier or
      // failed audit receipt must never be treated as a pass.
      if (!input.ports.verify || !input.ports.persistVerification) {
        return { answer: accepted, rounds: round, missing: [], stopped: 'checker_unavailable' }
      }
      const result = await input.ports.verify(input.request, answer).catch(() => null)
      const failures = result && Array.isArray(result.failures) ? unique(result.failures) : []
      const passed = result?.passed === true && failures.length === 0
      const receipt = { round, passed, failures: result ? failures : ['trusted_verifier_unavailable'] }
      try {
        await input.ports.persistVerification(receipt)
      } catch {
        return { answer: accepted, rounds: round, missing: ['verification_receipt_persistence_failed'], stopped: 'checker_unavailable' }
      }
      if (passed) return { answer, rounds: round, missing: [], stopped: 'complete' }
      return { answer: accepted, rounds: round, missing: receipt.failures.length ? receipt.failures : ['trusted_verification_failed'], stopped: 'checker_unavailable' }
    }
    missing = unique(checked)
    if (!missing.length && input.ports.verify) {
      const result = await input.ports.verify(input.request, answer).catch(() => null)
      const failures = result && Array.isArray(result.failures) ? unique(result.failures) : []
      const passed = result?.passed === true && failures.length === 0
      const receipt = { round, passed, failures: result ? failures : ['trusted_verifier_unavailable'] }
      if (input.ports.persistVerification) {
        try { await input.ports.persistVerification(receipt) } catch { return { answer, rounds: round, missing: receipt.failures.length ? receipt.failures : ['verification_receipt_persistence_failed'], stopped: 'checker_unavailable' } }
      }
      if (!passed) missing = receipt.failures.length ? [...receipt.failures] : ['trusted_verification_failed']
    }
    if (!missing.length) return { answer, rounds: round, missing, stopped: 'complete' }
    // A round that left as much missing as before is a loop going in circles: its text is dropped and the loop stops.
    if (previousMissing !== null && missing.length >= previousMissing) return { answer: accepted, rounds: round, missing, stopped: 'no_progress' }
    accepted = answer
    if (round >= maxRounds) return { answer, rounds: round, missing, stopped: 'max_rounds' }
    if (input.ports.remainingMs() < reserve) return { answer, rounds: round, missing, stopped: 'budget' }
    const addition = String(await input.ports.complete(input.request, answer, missing).catch(() => null) ?? '').trim()
    if (!addition) return { answer, rounds: round, missing, stopped: 'completion_unavailable' }
    answer = `${answer.trimEnd()}\n\n${addition}`
    previousMissing = missing.length
  }
}

export const ANSWER_COMPLETION_SYSTEM_PROMPT = [
  'You continue an answer that left parts of the request undelivered.',
  'Write ONLY the missing parts listed, with the same depth, specificity and honesty as the request deserves, as sections that follow the existing answer.',
  'Do not repeat, summarize or rewrite what the answer already says, and do not mention that you are continuing or that anything was missing.',
  'Separate observed facts from assumptions and hypotheses. Never claim checks, measurements or actions that were not performed.',
  'Return ONLY strict JSON: {"answer":"the missing parts","confidence":0.0}.',
].join(' ')
