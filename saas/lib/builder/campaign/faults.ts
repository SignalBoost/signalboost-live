// saas/lib/builder/campaign/faults.ts
//
// ISOLATED PROVIDER FAULTS FOR PAC-07..PAC-10. Each fault is a controlled provider stub (an InferenceTransport) that
// answers the deployed reasoner's model calls in place of the network; the reasoner runs the same release artifact,
// in the campaign job's own async scope, so no user request and no real provider is touched. The stub records every
// call it receives; the judge reads that record plus what the reasoner released and decides by fixed rules:
//
//   runpod_busy        the first call is refused as busy (HTTP 503); later calls answer completely.
//                      PASS: a complete answer was released (governed recovery) or nothing was released (bounded
//                      failure); calls stay under the ceiling; the turn ends inside its deadline.
//   model_timeout      every call hangs until the reasoner cancels it.
//                      PASS: every call was cancelled by the reasoner's own signal, nothing was released, calls
//                      stay under the ceiling, the turn ends inside its deadline (no uncontrolled retry loop).
//   output_truncation  every call returns a cut-off generation with finish_reason "length".
//                      PASS: nothing was released, or what was released is complete (never the cut text).
//   malformed_output   calls return broken JSON, empty text and a JSON object without the required keys, in turn.
//                      PASS: no exception escaped the reasoner, nothing was released or what was released parses
//                      as a complete answer, calls stay under the ceiling.
//
// Pure: no I/O. The host (hostPorts.ts) runs the reasoner under the stub and hands the observation here.

import type { InferenceTransport } from '../../ai/inferenceTransport.ts'
import type { AnswerOutcome } from '../../ai/cos/answerOutcomeVerifier.ts'
import { parseLocalResult } from '../../ai/cos/reasonerOutput.ts'
import type { PortResult } from './ports.ts'

export type CampaignFault = 'runpod_busy' | 'model_timeout' | 'output_truncation' | 'malformed_output'

/** The turn deadline each fault run gets; the reasoner's own budget is clamped to it. */
export const FAULT_TURN_DEADLINE_MS = 30_000
/** A turn may overrun its deadline by this much while cancellation propagates, no more. */
export const FAULT_DEADLINE_GRACE_MS = 5_000
/** More provider calls than this inside one faulted turn is an uncontrolled retry loop. */
export const FAULT_MAX_PROVIDER_CALLS = 8

/** A three-part analytical request: enough deliverables for the outcome verifier to grade, short enough for a stub. */
export const FAULT_PROMPT = [
  'A nightly ETL job that loads warehouse tables started finishing 40 minutes late this week.',
  'Row counts are unchanged; the source database shows no slow queries; the job host shows CPU at 95% for the whole run.',
  'A dependency upgrade of the CSV parsing library was deployed on Monday.',
  '1. Identify the plausible root causes consistent with these facts.',
  '2. Describe the decisive measurements that would separate them.',
  '3. State the most likely explanation with its uncertainty.',
  'Do not invent measurements.',
].join('\n')

/** The stub's complete answer: three numbered sections with their own analysis, satisfying the answer contract. */
export const FAULT_COMPLETE_ANSWER = [
  '1. Plausible root causes. The CPU saturation on the job host with unchanged row counts and a quiet source database points at the transformation stage, not extraction or loading. The Monday parser upgrade is the strongest candidate: a slower tokenizer, a changed default such as quoting detection or encoding sniffing, or lost streaming behaviour that now materialises whole files in memory would all raise CPU time per row. Second, a concurrent process on the same host (a backup, an index rebuild, another tenant job moved to this window) competing for cores would stretch wall-clock time with the same work. Third, a change in input shape within the same row counts, such as wider rows or more quoted fields, would raise parsing cost without changing counts.',
  '2. Decisive measurements. Profile one run of the job with the parser pinned to the previous version and compare per-stage timings; a return to the old duration isolates the upgrade. Read per-process CPU on the host during the window to see whether the job itself or a neighbour consumes the cores. Compare bytes per row and quoted-field density of this week\'s inputs against last week\'s to rule the input shape in or out. Check the job\'s resident memory curve for a shift from streaming to whole-file materialisation.',
  '3. Most likely explanation. The parser dependency upgrade changed the cost of parsing each row, most likely by dropping streaming or adding per-field detection, which saturates the host CPU and extends the run by roughly forty minutes. Confidence is moderate: the timing of the deployment and the CPU signature fit, but a neighbouring process on the host has not been excluded, and the pinned-version comparison in part two is what confirms or refutes this.',
].join('\n\n')

export type ProviderCall = Readonly<{
  /** Order of arrival, from 1. */
  index: number
  /** How the stub answered: an HTTP status, "hang" for a call held until cancelled, or "cancelled" once it was. */
  outcome: string
  /** Whether the reasoner's own signal cancelled this call. */
  cancelled: boolean
  startedAfterMs: number
  endedAfterMs: number | null
}>

export type FaultObservation = Readonly<{
  fault: CampaignFault
  calls: readonly ProviderCall[]
  /** What the reasoner released, or null when it released nothing. */
  released: string | null
  /** An exception that escaped the reasoner, or null. */
  escaped: string | null
  elapsedMs: number
  /**
   * The independent verifier's verdict on the released answer, judged by the host after the stub run ends (inside it
   * the stub is the only provider, so no independent judge exists there). Null when nothing parseable was released.
   */
  releasedOutcome: AnswerOutcome | null
}>

export type FaultStub = Readonly<{
  transport: InferenceTransport
  calls: () => readonly ProviderCall[]
}>

function completion(content: string, finishReason: 'stop' | 'length', completionTokens: number): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 400, completion_tokens: completionTokens, total_tokens: 400 + completionTokens },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function answerJson(answer: string, confidence: number): string {
  return JSON.stringify({ answer, confidence })
}

/** The cut-off generation: the complete answer's JSON stopped mid-sentence, as a provider returns it at max_tokens. */
export function truncatedAnswerText(): string {
  return answerJson(FAULT_COMPLETE_ANSWER, 0.7).slice(0, 420)
}

/** Build the controlled provider stub for one fault. */
export function createFaultStub(fault: CampaignFault, now: () => number = Date.now): FaultStub {
  const startedAt = now()
  const calls: ProviderCall[] = []
  const record = (outcome: string): number => {
    calls.push({ index: calls.length + 1, outcome, cancelled: false, startedAfterMs: now() - startedAt, endedAfterMs: null })
    return calls.length - 1
  }
  const finish = (at: number, outcome: string, cancelled: boolean) => {
    calls[at] = { ...calls[at], outcome, cancelled, endedAfterMs: now() - startedAt }
  }
  const transport: InferenceTransport = async (_url, init) => {
    const at = record('pending')
    switch (fault) {
      case 'runpod_busy': {
        if (at === 0) {
          finish(at, '503', false)
          return new Response(JSON.stringify({ error: { message: 'busy: the reasoner is serving another request' } }), { status: 503, headers: { 'content-type': 'application/json' } })
        }
        finish(at, '200', false)
        return completion(answerJson(FAULT_COMPLETE_ANSWER, 0.7), 'stop', 900)
      }
      case 'model_timeout': {
        finish(at, 'hang', false)
        return new Promise<Response>((_resolve, reject) => {
          const onAbort = () => {
            finish(at, 'cancelled', true)
            reject(init.signal.reason instanceof Error ? init.signal.reason : new DOMException('The operation was aborted', 'AbortError'))
          }
          if (init.signal.aborted) onAbort()
          else init.signal.addEventListener('abort', onAbort, { once: true })
        })
      }
      case 'output_truncation': {
        finish(at, '200 length', false)
        return completion(truncatedAnswerText(), 'length', 400)
      }
      case 'malformed_output': {
        const variant = at % 3
        if (variant === 0) { finish(at, '200 broken_json', false); return completion('{"answer": "The parser upgrade', 'stop', 12) }
        if (variant === 1) { finish(at, '200 empty', false); return completion('', 'stop', 0) }
        finish(at, '200 missing_keys', false)
        return completion(JSON.stringify({ result: 'done', score: 3 }), 'stop', 10)
      }
    }
  }
  return { transport, calls: () => calls.slice() }
}

function callsEvidence(observation: FaultObservation) {
  return observation.calls.map(call => ({
    kind: 'model_call' as const,
    label: `provider call ${call.index}`,
    detail: `${call.outcome}; started +${call.startedAfterMs} ms; ended ${call.endedAfterMs === null ? 'never' : `+${call.endedAfterMs} ms`}; cancelled by reasoner: ${call.cancelled ? 'yes' : 'no'}`,
  }))
}

/** A released answer is complete when it parses, is not marked truncated, and the verifier found every deliverable delivered. */
function releasedComplete(released: string, outcome: AnswerOutcome | null): boolean {
  const parsed = parseLocalResult(released)
  if (!parsed || parsed.truncated === true) return false
  return outcome?.status === 'verified'
}

/** A parseable, untruncated release the verifier could not judge cannot be graded either way. */
function releasedUngraded(released: string, outcome: AnswerOutcome | null): boolean {
  const parsed = parseLocalResult(released)
  return Boolean(parsed && parsed.truncated !== true && (!outcome || outcome.status === 'unverified'))
}

/** Decide PASS or FAIL for one fault from what the stub recorded and what the reasoner released. */
export function judgeFault(observation: FaultObservation): PortResult {
  const failures: string[] = []
  const calls = observation.calls.length
  const releasedSummary = observation.released === null
    ? 'nothing released'
    : releasedComplete(observation.released, observation.releasedOutcome) ? 'complete answer released'
      : releasedUngraded(observation.released, observation.releasedOutcome) ? 'answer released, not graded: the independent outcome verifier could not run'
        : 'released text is not a complete answer'
  if (observation.escaped !== null) failures.push(`exception escaped the reasoner: ${observation.escaped}`)
  if (calls === 0) failures.push('the reasoner made no provider call')
  if (calls > FAULT_MAX_PROVIDER_CALLS) failures.push(`${calls} provider calls in one turn exceeds the ceiling of ${FAULT_MAX_PROVIDER_CALLS}`)
  if (observation.elapsedMs > FAULT_TURN_DEADLINE_MS + FAULT_DEADLINE_GRACE_MS) failures.push(`turn ran ${observation.elapsedMs} ms, past its ${FAULT_TURN_DEADLINE_MS} ms deadline and ${FAULT_DEADLINE_GRACE_MS} ms grace`)
  const ungraded = observation.released !== null && releasedUngraded(observation.released, observation.releasedOutcome)
  if (observation.released !== null && !ungraded && !releasedComplete(observation.released, observation.releasedOutcome)) failures.push('an incomplete answer was released')
  if (observation.fault === 'model_timeout') {
    const uncancelled = observation.calls.filter(call => !call.cancelled)
    if (uncancelled.length) failures.push(`${uncancelled.length} hung call(s) were not cancelled by the reasoner`)
    if (observation.released !== null) failures.push('an answer was released although every provider call hung')
  }
  if (observation.fault === 'output_truncation' && observation.released !== null) {
    const parsed = parseLocalResult(observation.released)
    if (!parsed || parsed.truncated === true || parsed.answer.length < FAULT_COMPLETE_ANSWER.length) failures.push('the cut-off generation was presented as an answer')
  }
  const evidence = [
    ...callsEvidence(observation),
    { kind: 'note' as const, label: 'turn', detail: `${calls} provider call(s); ${observation.elapsedMs} ms; ${releasedSummary}${observation.escaped ? `; escaped: ${observation.escaped}` : ''}` },
  ]
  if (failures.length) return { verdict: 'FAIL', actual: failures.join('; '), evidence, failureCause: failures[0] }
  if (ungraded) return { verdict: 'BLOCKED', actual: `${releasedSummary}; ${calls} provider call(s); ${observation.elapsedMs} ms`, evidence, failureCause: 'independent outcome verifier unavailable' }
  return { verdict: 'PASS', actual: `${releasedSummary}; ${calls} provider call(s); ${observation.elapsedMs} ms`, evidence }
}
