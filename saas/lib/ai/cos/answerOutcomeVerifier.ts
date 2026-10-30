// saas/lib/ai/cos/answerOutcomeVerifier.ts
//
// THE ONE OUTCOME VERIFIER FOR ANSWERS. Whether an answer delivered what the person asked for is decided here, by a
// separate judge call that reads only the request and the finished answer (never the writer's drafts, reasoning or
// self-assessment), and by the host, which accepts a deliverable as delivered only when the judge quotes the part of
// the answer that delivers it and that quote is really in the answer. COS uses it to release answers; the
// verification campaign uses the same function to grade them, so the two can never disagree.
//
// It replaces the word-count and vocabulary rules (answerTaskContract.ts) as the release decision. A judge that is
// unavailable, times out or returns anything unreadable gives "unverified", never "verified" and never "incomplete":
// an outage is not a finding about the answer.

import { createHash } from 'node:crypto'
import { normalizeHarnessVerification } from '../../../platform-harness/verification/outcome-verifier.ts'
import type { HarnessVerificationResult } from '../../../platform-harness/core/types.ts'

export const ANSWER_OUTCOME_VERIFIER_REF = 'verifier://cos/answer-outcome/v1'

/** A separate model call: the request and the answer in, the judge's raw reply out; null when it could not run. */
export type AnswerOutcomeJudge = (request: string, answer: string) => Promise<string | null>

export type AnswerDeliverableVerdict = Readonly<{
  deliverable: string
  delivered: boolean
  /** The exact passage of the answer that delivers it, as found in the answer; null when not delivered. */
  evidence: string | null
}>

export type AnswerOutcomeStatus = 'verified' | 'incomplete' | 'unverified'

export type AnswerOutcome = Readonly<{
  status: AnswerOutcomeStatus
  /** Requested deliverables the answer does not deliver, in the judge's words. Empty unless incomplete. */
  missing: readonly string[]
  deliverables: readonly AnswerDeliverableVerdict[]
  verification: HarnessVerificationResult
}>

/** A quote shorter than this cannot show which part of the answer delivers a deliverable. */
const MIN_EVIDENCE_WORDS = 4
const MAX_DELIVERABLES = 20

export const ANSWER_OUTCOME_VERIFIER_SYSTEM_PROMPT = [
  'You are an independent verifier. You did not write the answer. You receive a request and the answer given to it.',
  'List every deliverable the request asks for: each question, task, item, constraint and required format. Do not add anything the request did not ask for, and do not judge style.',
  'For each deliverable decide whether the answer actually delivers it with real, specific substance. A heading, a restated question, a promise, a refusal, or a generic paragraph does not deliver it. When the person could not supply some evidence and the answer handles that honestly, the deliverable is still delivered.',
  'Name each deliverable in at most 8 words. For each delivered deliverable copy, word for word, 5 to 12 consecutive words of the answer that deliver it. Never paraphrase the quote. Write nothing else.',
  'Return ONLY strict JSON: {"deliverables":[{"item":"at most 8 words","delivered":true,"quote":"5 to 12 exact words from the answer"},{"item":"at most 8 words","delivered":false,"quote":""}]}.',
].join(' ')

function normalized(text: string): string {
  return String(text || '').toLowerCase().replace(/[*_`#>|]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * The deliverable objects of the judge's reply, in order, and whether the list was closed. A verdict cut off by the
 * token limit still yields every object written in full before the cut (production 2026-10-30: replies stopped at the
 * limit and were thrown away whole, so successful judge calls ended as "unavailable").
 */
function deliverableObjects(text: string): Readonly<{ objects: unknown[]; closed: boolean }> | null {
  const key = text.indexOf('"deliverables"')
  const open = key < 0 ? -1 : text.indexOf('[', key)
  if (open < 0) return null
  const objects: unknown[] = []
  let depth = 0
  let start = -1
  let inString = false
  for (let index = open + 1; index < text.length; index++) {
    const char = text[index]
    if (inString) {
      if (char === '\\') index++
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') { if (depth++ === 0) start = index }
    else if (char === '}' && depth > 0) {
      if (--depth === 0) {
        try { objects.push(JSON.parse(text.slice(start, index + 1))) } catch { return null }
      }
    } else if (char === ']' && depth === 0) return { objects, closed: true }
  }
  return { objects, closed: false }
}

/** Read the judge's reply: the verdicts it gave and whether it judged the whole request (false when it was cut off). */
export function readAnswerOutcome(raw: string | null | undefined, answer: string, request = ''): Readonly<{ verdicts: AnswerDeliverableVerdict[]; complete: boolean }> | null {
  const read = deliverableObjects(String(raw || ''))
  if (!read) return null
  const body = normalized(answer)
  const asked = normalized(request)
  const verdicts: AnswerDeliverableVerdict[] = []
  for (const entry of read.objects.slice(0, MAX_DELIVERABLES)) {
    if (!entry || typeof entry !== 'object') continue
    const item = String((entry as any).item || '').trim().replace(/\s+/g, ' ').slice(0, 300)
    if (!item) continue
    const quote = String((entry as any).quote || '').trim()
    // The host, not the judge, decides that a quote is evidence: it must be long enough to point at a passage, be
    // found in the answer, and not be text the request itself supplied (a restated question delivers nothing).
    const evidence = normalized(quote)
    const found = (entry as any).delivered === true
      && quote.split(/\s+/).filter(Boolean).length >= MIN_EVIDENCE_WORDS
      && body.includes(evidence)
      && !asked.includes(evidence)
    verdicts.push({ deliverable: item, delivered: found, evidence: found ? quote.slice(0, 500) : null })
  }
  return verdicts.length ? { verdicts, complete: read.closed } : null
}

/** The verdicts of a reply that judged the whole request; null otherwise. */
export function parseAnswerOutcome(raw: string | null | undefined, answer: string, request = ''): AnswerDeliverableVerdict[] | null {
  const read = readAnswerOutcome(raw, answer, request)
  return read?.complete ? read.verdicts : null
}

function evidenceRef(request: string, answer: string, index: number): string {
  const digest = createHash('sha256').update(request).update('\u0000').update(answer).digest('hex').slice(0, 16)
  return `answer:${digest}#deliverable-${index + 1}`
}

function outcomeFrom(request: string, answer: string, verdicts: readonly AnswerDeliverableVerdict[] | null, reason: string | null): AnswerOutcome {
  if (!verdicts) {
    return Object.freeze({
      status: 'unverified',
      missing: Object.freeze([]),
      deliverables: Object.freeze([]),
      verification: normalizeHarnessVerification({
        verified: false, verifierRef: ANSWER_OUTCOME_VERIFIER_REF, evidenceRefs: [],
        reason: reason || 'answer_outcome_judge_unavailable', failureAttribution: 'infrastructure',
      }),
    })
  }
  const missing = verdicts.filter(verdict => !verdict.delivered).map(verdict => verdict.deliverable)
  const verification = normalizeHarnessVerification({
    verified: missing.length === 0,
    verifierRef: ANSWER_OUTCOME_VERIFIER_REF,
    evidenceRefs: verdicts.flatMap((verdict, index) => verdict.delivered ? [evidenceRef(request, answer, index)] : []),
    ...(missing.length ? { reason: `undelivered: ${missing.join('; ')}`, failureAttribution: 'competency' as const } : {}),
  })
  return Object.freeze({
    status: verification.verified ? 'verified' : 'incomplete',
    missing: Object.freeze(missing),
    deliverables: Object.freeze([...verdicts]),
    verification,
  })
}

export async function verifyAnswerOutcome(input: Readonly<{
  request: string
  answer: string
  judge: AnswerOutcomeJudge
}>): Promise<AnswerOutcome> {
  const request = String(input.request || '')
  const answer = String(input.answer || '')
  if (!answer.trim()) {
    return outcomeFrom(request, answer, [{ deliverable: 'an answer to the request', delivered: false, evidence: null }], null)
  }
  const raw = await input.judge(request, answer).catch(() => null)
  const read = readAnswerOutcome(raw, answer, request)
  // A cut-off verdict that already found an undelivered deliverable is a finding; one that found none judged only
  // part of the request and verifies nothing.
  const cutOffFinding = read && !read.complete && read.verdicts.some(verdict => !verdict.delivered)
  const outcome = read?.complete || cutOffFinding
    ? outcomeFrom(request, answer, cutOffFinding ? read!.verdicts.filter(verdict => !verdict.delivered) : read!.verdicts, null)
    : outcomeFrom(request, answer, null, raw === null ? 'answer_outcome_judge_unavailable' : read ? 'answer_outcome_judge_cut_off' : 'answer_outcome_judge_unreadable')
  console.info('[cos-answer-outcome]', JSON.stringify({
    status: outcome.status,
    deliverables: outcome.deliverables.length,
    delivered: outcome.deliverables.filter(item => item.delivered).length,
    reason: outcome.status === 'unverified' ? outcome.verification.reason : null,
  }))
  return outcome
}

/** An answer is withheld only on the verifier's finding that something requested is missing. */
export function answerOutcomeReleasable(outcome: AnswerOutcome): boolean {
  return outcome.status !== 'incomplete'
}
