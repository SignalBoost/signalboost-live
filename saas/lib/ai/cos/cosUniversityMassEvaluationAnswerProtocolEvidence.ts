// saas/lib/ai/cos/cosUniversityMassEvaluationAnswerProtocolEvidence.ts
//
// What an unparseable exam answer actually looked like (owner go, 2026-10-07).
//
// Production 2026-10-07: the first full-batch artifact (mass:1483a581...:cce37709fe6b02aa) failed 9 of 10 exams with the
// identical error mass_distilled_evaluation_answer_missing:36d2ea4c166ef920:finish=stop:think=0:open=0:close=1:other=1:cap=1024.
// That shape (a foreign 16-hex opener, the correct closer, normal stop, solo retry) is the one
// recoverStoppedSoloForeignOpenCorrectCloseAnswer exists for, yet it escaped it. The failed-exam event recorded only the
// error string: not the model's text, not whether the baseline or the trained artifact produced it. Any recovery written
// from that would be a guess, and a loose recovery could accept answers it must not.
//
// When a model's answer cannot be parsed and the evaluator gives up on it, the thrown error now carries this bounded
// description of the response that failed. The MESSAGE is unchanged (the rolling authority's circuit breaker compares
// whole error strings); the diagnostic is written on the FAILED exam event only. It is evidence: scoring, gating,
// recovery, the circuit breaker and spend never read it. It holds model output only - no prompt, reference or credential.
export const ANSWER_PROTOCOL_EVIDENCE_PROFILE = 'cos-university-mass-evaluation-answer-protocol-v1' as const
const HEAD_CHARS = 400
const NEAR_CLOSE_CHARS = 200
const TAIL_CHARS = 200
const MAX_MARKERS = 12

export type AnswerProtocolDiagnostic = Readonly<{
  profile: typeof ANSWER_PROTOCOL_EVIDENCE_PROFILE
  /** Which model produced the response: the untrained baseline or the trained artifact. */
  role: 'baseline' | 'candidate'
  caseId: string
  /** Cases in the request that produced this response (1 = the solo retry). */
  cases: number
  finish: string
  cap: number
  chars: number
  /**
   * Every protocol marker in order, as KIND:WHOSE@offset. WHOSE is `requested` (this case's id), `foreign` (another
   * 16-hex id) or `malformed` (anything else, including an opener missing its closing >>>). At most 12.
   */
  markers: readonly string[]
  markerCount: number
  /** Characters before the first marker (0 when the response starts with one, or has none). */
  leadingChars: number
  head: string
  /** The text immediately before this case's END marker, when one is present. */
  beforeRequestedClose: string | null
  tail: string
}>

const MARKER = /<<<(ANSWER|END):([^>\r\n]{0,120})(>>>)?/gi

export function describeAnswerProtocol(input: {
  text: string
  caseId: string
  role: 'baseline' | 'candidate'
  cases: number
  finish: string
  cap: number
}): AnswerProtocolDiagnostic {
  const text = String(input.text ?? '')
  const requested = input.caseId.toLowerCase()
  const found = [...text.matchAll(MARKER)]
  const markers = found.slice(0, MAX_MARKERS).map(match => {
    const id = String(match[2]).toLowerCase()
    const whose = !match[3] ? 'malformed' : id === requested ? 'requested' : /^[0-9a-f]{16}$/.test(id) ? 'foreign' : 'malformed'
    return `${match[1].toUpperCase()}:${whose}@${match.index ?? 0}`
  })
  const close = text.indexOf(`<<<END:${input.caseId}>>>`)
  return Object.freeze({
    profile: ANSWER_PROTOCOL_EVIDENCE_PROFILE,
    role: input.role,
    caseId: input.caseId.slice(0, 100),
    cases: input.cases,
    finish: (input.finish || 'unknown').slice(0, 40),
    cap: input.cap,
    chars: text.length,
    markers: Object.freeze(markers),
    markerCount: found.length,
    leadingChars: found.length ? (found[0].index ?? 0) : 0,
    head: text.slice(0, HEAD_CHARS),
    beforeRequestedClose: close < 0 ? null : text.slice(Math.max(0, close - NEAR_CLOSE_CHARS), close),
    tail: text.length > HEAD_CHARS ? text.slice(-TAIL_CHARS) : '',
  })
}

export class MassEvaluationAnswerProtocolError extends Error {
  readonly diagnostic: AnswerProtocolDiagnostic
  constructor(message: string, diagnostic: AnswerProtocolDiagnostic) {
    super(message)
    this.name = 'MassEvaluationAnswerProtocolError'
    this.diagnostic = diagnostic
  }
}

/** The answer-protocol diagnostic an unparseable-answer failure carries, or null for any other error. */
export function answerProtocolDiagnosticOf(error: unknown): AnswerProtocolDiagnostic | null {
  return error instanceof MassEvaluationAnswerProtocolError ? error.diagnostic : null
}
