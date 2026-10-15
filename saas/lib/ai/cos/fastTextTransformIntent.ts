// saas/lib/ai/cos/fastTextTransformIntent.ts
//
// Keep the latency-sensitive text-edit lane narrow. A transform verb is not, by itself, proof that
// the whole turn is an editing task: "edit - what are CAPs?" is a factual question and belongs to
// normal COS. The fast lane accepts an explicit supplied draft, an explicit editing instruction, or
// a terse continuation when there is a real prior assistant draft.
//
// Only the user's own words can make the turn a question. A pasted email thread below the draft is
// reference material: a question someone else asked in that thread ("Can you please check with
// Luis about these transactions?") must not turn "edit - <reply> <quoted thread>" into a new question.

import { stripQuotedEmailThread } from './quotedEmailThread.ts'

export type FastTextTransformContext = {
  previousAssistant?: string | null
}

const FAST_TEXT_COMMAND = /^\s*(edit|rewrite|rephrase|proofread|polish|correct(?:\s+the)?(?:\s+grammar)?|fix(?:\s+the)?(?:\s+(?:grammar|spelling|punctuation|wording))?|translate|shorten|improve(?:\s+the)?(?:\s+wording)?|make\s+(?:this|it)\s+(?:more\s+)?(?:professional|clear|concise|friendly|formal))\b/i

const EXPLICIT_EDIT_INSTRUCTION = /^\s*(?:rewrite|rephrase|proofread|polish|translate|shorten|correct(?:\s+the)?(?:\s+(?:grammar|spelling|punctuation|wording))?|fix\s+(?:the\s+)?(?:grammar|spelling|punctuation|wording))\b/i

const QUESTION_START = /^\s*(?:who|what|when|where|why|how|which|whose|can\s+you|could\s+you|would\s+you|will\s+you|do\s+you|does\b|did\b|is\b|are\b|was\b|were\b|has\b|have\b|had\b|should\b|tell\s+me\b|explain\b)/i
const QUESTION_ANYWHERE = /(?:^|[.!?]\s+|\n\s*)(?:who|what|when|where|why|how|which|whose|can\s+you|could\s+you|would\s+you|will\s+you|do\s+you|does\b|did\b|is\b|are\b|was\b|were\b|has\b|have\b|had\b|should\b|tell\s+me\b|explain\b)[^\n]{0,320}\?/i
const FAILED_PRIOR_REPLY = /(?:stopped waiting|could not complete|timed? out|timeout|nothing was sent|check history|request was not replayed|worker failed)/i

function hasUsablePriorDraft(value: string | null | undefined): boolean {
  const text = String(value || '').trim()
  return text.length >= 8 && !FAILED_PRIOR_REPLY.test(text)
}

function suppliedDraftAfterCommand(input: string, commandEnd: number): string {
  const remainder = input.slice(commandEnd).trim()
  return remainder.replace(/^\s*(?:[-—–:]\s*|(?:this|the following)(?:\s+(?:text|message|paragraph|email|draft))?\s*[:—–-]?\s*)/i, '').trim()
}

// A draft written to someone else: it greets a recipient, signs off, or the command names it as
// the user's own reply/email/message. Questions inside such a draft are questions to its recipient,
// not to COS. Production 2026-10-15: "edit my reply - Hi Andrea, … What time is the embassy work
// hours? …" was routed as a new question and took 15-25 s through the general pipeline.
const DRAFT_GREETING = /^\s*(?:hi|hello|hey|dear|good\s+(?:morning|afternoon|evening)|hola|ol[aá]|bonjour|hallo|ciao|cze[sś][ćc]|dzie[nń]\s+dobry|привет|здравствуйте)\b[^\n]{0,60}[,!:\n]/iu
const DRAFT_SIGN_OFF = /(?:^|\n|[.!?]\s+)(?:thank\s+you|thanks|regards|best(?:\s+regards)?|sincerely|cheers|kind\s+regards|respectfully|gracias|obrigad[oa]|dzi[eę]kuj[eę]|спасибо)\b[^\n]{0,40}$/imu
const NAMED_OWN_DRAFT = /^\s*(?:my|this|the\s+following)\s+(?:reply|response|email|e-mail|message|note|text|draft|answer|letter)\b/i

// A closing courtesy alone is weak evidence: "I received a CAP notice. Can you explain what it
// means? Thanks" asks COS for an explanation. Without a greeting or a named draft, a sign-off
// protects only questions that ask the recipient to act, never a request for an explanation.
const INFORMATION_REQUEST = /\b(?:explain|tell\s+me|what\s+(?:it|this|that)\s+means|what\s+(?:does|do)\b[^\n?]{0,60}\bmean|meaning\s+of)\b/i

function looksLikeDraftToRecipient(payload: string): boolean {
  const value = String(payload || '').trim()
  if (NAMED_OWN_DRAFT.test(value) || DRAFT_GREETING.test(value)) return true
  return DRAFT_SIGN_OFF.test(value) && !INFORMATION_REQUEST.test(value)
}

function looksLikeNewQuestion(text: string): boolean {
  const value = String(text || '').trim()
  if (!value) return false
  if (QUESTION_START.test(value)) return true
  return QUESTION_ANYWHERE.test(value) && !looksLikeDraftToRecipient(value)
}

export function isFastTextTransform(input: string, context: FastTextTransformContext = {}): boolean {
  const text = String(input || '').trim()
  const match = FAST_TEXT_COMMAND.exec(text)
  if (!match) return false

  const priorDraft = hasUsablePriorDraft(context.previousAssistant)
  const payload = suppliedDraftAfterCommand(text, match[0].length)

  // A transform-looking prefix must never swallow a factual/advisory question from the user.
  if (looksLikeNewQuestion(stripQuotedEmailThread(payload))) return false

  // Terse continuation such as "shorter" or "polish" is safe only when there is an actual prior
  // assistant draft to transform. Transport/error copy does not count as a draft.
  if (!payload) return priorDraft

  // Explicit editing verbs plus supplied text are unambiguous.
  if (EXPLICIT_EDIT_INSTRUCTION.test(text)) return true

  // Generic "edit/improve/make this..." is accepted only when it carries a real draft payload or
  // follows a real prior draft; merely starting a question with "edit" is not enough.
  return payload.length >= 8 || priorDraft
}
