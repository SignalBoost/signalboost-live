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
  'Identify only what the user actually requests in the REQUEST: questions, explicit analytical tasks, required output constraints, and required format. Scenario facts, measurements, quotations, observations, chronology and other supplied background are evidence for those tasks, NOT separate deliverables merely because the request includes them. Do not add anything the user did not ask for, and do not judge style.',
  'For each deliverable decide whether the answer actually delivers it with real, specific substance. A heading, a restated question, a promise, a refusal, or a generic paragraph does not deliver it. When the person could not supply some evidence and the answer handles that honestly, the deliverable is still delivered.',
  'Correspondence requests can contain separate personal questions such as what the writer should do if a claimed policy exists. Treat a sendable letter and separately requested advice as DISTINCT deliverables. A letter asking its recipient for advice does not itself provide advice to the user. Mark missing personal guidance as undelivered unless the answer gives it outside the draft.',
  'Factual fidelity is part of delivering a correct answer, not a stylistic preference: preserve user-supplied titles, roles, acronyms, dates, thresholds, uncertainty, and the distinction between mandatory rules, benefit eligibility and discretionary exceptions. Do not mark a draft delivered if it invents an expansion or asserts an unsupported material legal or policy fact. If sources were not independently provided to the verifier, do not treat a newly asserted law or entitlement as proved merely because the answer confidently states it.',
  'For each delivered deliverable copy, word for word, the passage of the answer (5 to 8 words) that delivers it. Never paraphrase the quote.',
  'Name each deliverable in at most 6 words. Write nothing but the verdict: no explanation, no answer of your own.',
  'Return ONLY strict JSON: {"deliverables":[{"item":"short description","delivered":true,"quote":"exact words from the answer"},{"item":"short description","delivered":false,"quote":""}]}.',
].join(' ')

function normalized(text: string): string {
  return String(text || '').toLowerCase().replace(/[*_`#>|]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Read the judge's reply. Returns null when it is not a readable verdict on at least one deliverable. */
export function parseAnswerOutcome(raw: string | null | undefined, answer: string, request = ''): AnswerDeliverableVerdict[] | null {
  const text = String(raw || '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let parsed: { deliverables?: unknown }
  try { parsed = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  if (!Array.isArray(parsed.deliverables)) return null
  const body = normalized(answer)
  const asked = normalized(request)
  const verdicts: AnswerDeliverableVerdict[] = []
  for (const entry of parsed.deliverables.slice(0, MAX_DELIVERABLES)) {
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
  return verdicts.length ? verdicts : null
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
  const outcome = outcomeFrom(request, answer, parseAnswerOutcome(raw, answer, request), raw === null ? 'answer_outcome_judge_unavailable' : 'answer_outcome_judge_unreadable')
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
