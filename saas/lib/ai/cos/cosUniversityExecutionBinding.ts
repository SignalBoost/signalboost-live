// saas/lib/ai/cos/cosUniversityExecutionBinding.ts
/**
 * Binds the answer a lane actually scored to the execution receipt it stores beside the grade.
 *
 * A bound execution receipt records `responseHash = sha256(reply)` at the moment of inference. Every
 * later validator — `isBoundSoftwareCapstoneEvidence`, `assessmentCarriesBoundExecution` — only
 * checks that the field is a well-formed digest, because by then the reply is gone: the academic
 * ledgers deliberately store no answer text. So the digest is only meaningful if someone compares it
 * to the reply while both are still in hand, and that happens in exactly one place — the runner,
 * between inference and scoring.
 *
 * The non-credit practice lane already did this (`cosUniversityPracticeExecution`, which throws
 * `university_practice_execution_binding_invalid` on a mismatch). The five credit-bearing lanes did
 * not: independent exams, subject A-range, language A-range, delayed retention and Master's exams
 * each scored `bound.reply` and persisted `bound.execution` with nothing tying the two together.
 * Their receipts proved that a bound execution occurred, not that it produced the scored answer.
 *
 * Nothing here grants credit, scores, or reads a rubric. It answers one question: is this receipt
 * about this answer?
 */

import { createHash } from 'node:crypto'

const SHA256 = /^[a-f0-9]{64}$/

export type BoundExecutionResponseEvidence = Readonly<{ responseHash?: unknown }>

export function scoredReplyHash(reply: string): string {
  return createHash('sha256').update(reply).digest('hex')
}

/**
 * True when the receipt attests this exact reply. A missing or malformed digest is false: an absent
 * binding is not a satisfied one.
 */
export function scoredReplyMatchesExecution(reply: unknown, execution: BoundExecutionResponseEvidence | null | undefined): boolean {
  if (typeof reply !== 'string' || !reply.trim()) return false
  const recorded = execution?.responseHash
  if (typeof recorded !== 'string' || !SHA256.test(recorded)) return false
  return recorded === scoredReplyHash(reply)
}

/**
 * The reason a graded lane must refuse, or null when the binding holds. Returned rather than thrown
 * so each runner reports it through its own `fail([...])` path and still writes an honest receipt.
 */
export function boundExecutionBindingFailure(
  reply: unknown,
  execution: BoundExecutionResponseEvidence | null | undefined,
): string | null {
  if (typeof reply !== 'string' || !reply.trim()) return 'scored_reply_missing'
  const recorded = execution?.responseHash
  if (typeof recorded !== 'string' || !SHA256.test(recorded)) return 'execution_response_hash_missing'
  return recorded === scoredReplyHash(reply) ? null : 'scored_reply_execution_mismatch'
}
