// saas/lib/ai/cos/answerCompletionLoop.ts
//
// THE ANSWER LOOP (2026-10-26). A COS answer used to be one pass: draft, one repair, release. Nothing asked "did this
// answer deliver everything the person asked for?" before it was released, and nothing went around again while time
// remained. This is the observe -> check -> act -> check loop harness engineering prescribes (LangChain's
// Terminal-Bench harness: check the work against the task before finishing; stop a loop that makes no progress):
//
//   1. Check: list what the request asked for that the answer does not yet deliver. The model reads the whole
//      request and answer; numbered deliverables the person wrote are also checked deterministically.
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
  /** Deliverables the request itself numbers, checked deterministically on every round. */
  deterministicMissing?: (answer: string) => readonly string[]
  ports: AnswerCompletionPorts
  maxRounds?: number
  roundReserveMs?: number
}>): Promise<AnswerCompletionResult> {
  const maxRounds = Math.max(0, Math.min(ANSWER_COMPLETION_MAX_ROUNDS, input.maxRounds ?? ANSWER_COMPLETION_MAX_ROUNDS))
  const reserve = Math.max(0, input.roundReserveMs ?? ANSWER_COMPLETION_ROUND_RESERVE_MS)
  let answer = String(input.answer || '')
  let previousMissing: number | null = null
  let missing: string[] = []
  for (let round = 0; ; round++) {
    if (input.ports.remainingMs() < reserve) return { answer, rounds: round, missing, stopped: 'budget' }
    const checked = await input.ports.check(input.request, answer).catch(() => null)
    const floor = input.deterministicMissing ? [...input.deterministicMissing(answer)] : []
    if (checked === null && !floor.length) return { answer, rounds: round, missing: floor, stopped: 'checker_unavailable' }
    missing = unique([...floor, ...(checked ?? [])])
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
    // A round that left as much missing as before is a loop going in circles: stop instead of paying for another.
    if (previousMissing !== null && missing.length >= previousMissing) return { answer, rounds: round, missing, stopped: 'no_progress' }
    if (round >= maxRounds) return { answer, rounds: round, missing, stopped: 'max_rounds' }
    if (input.ports.remainingMs() < reserve) return { answer, rounds: round, missing, stopped: 'budget' }
    const addition = String(await input.ports.complete(input.request, answer, missing).catch(() => null) ?? '').trim()
    if (!addition) return { answer, rounds: round, missing, stopped: 'completion_unavailable' }
    answer = `${answer.trimEnd()}\n\n${addition}`
    previousMissing = missing.length
  }
}

/** The checker's reply: {"missing":["…"]}. Anything else is "could not check", never "complete". */
export function parseAnswerCompletionCheck(raw: string | null | undefined): string[] | null {
  const text = String(raw || '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { missing?: unknown }
    if (!Array.isArray(parsed.missing)) return null
    return parsed.missing.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 12)
  } catch {
    return null
  }
}

export const ANSWER_COMPLETION_CHECK_SYSTEM_PROMPT = [
  'You check an answer against the request it answers. Read the whole request: every question, deliverable, constraint and format the person asked for.',
  'List each requested item the answer does not yet deliver with real, specific substance. A heading without content, a restated question, or a generic paragraph does not deliver an item.',
  'Do not ask for more than the request asked for. Do not judge style. Missing evidence that the person could not supply is not a missing item when the answer handles it honestly.',
  'Return ONLY strict JSON: {"missing":["short description of each undelivered item"]}. Return {"missing":[]} when everything requested is delivered.',
].join(' ')

export const ANSWER_COMPLETION_SYSTEM_PROMPT = [
  'You continue an answer that left parts of the request undelivered.',
  'Write ONLY the missing parts listed, with the same depth, specificity and honesty as the request deserves, as sections that follow the existing answer.',
  'Do not repeat, summarize or rewrite what the answer already says, and do not mention that you are continuing or that anything was missing.',
  'Separate observed facts from assumptions and hypotheses. Never claim checks, measurements or actions that were not performed.',
  'Return ONLY strict JSON: {"answer":"the missing parts","confidence":0.0}.',
].join(' ')
