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

import { splitQuotedEmailThread, stripQuotedEmailThread } from './quotedEmailThread.ts'

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

function looksLikeNewQuestion(text: string): boolean {
  const value = String(text || '').trim()
  if (!value) return false
  return QUESTION_START.test(value) || QUESTION_ANYWHERE.test(value)
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

/**
 * Model prompt for the fast edit lane. The user's draft is the only text to edit; a quoted email
 * thread pasted below it is passed as read-only context so the editor understands what the draft
 * replies to, but never rewrites or returns the other people's messages.
 */
export function fastTextTransformPrompt(input: string): string {
  const { editableSource, referenceContext } = splitQuotedEmailThread(input)
  if (!referenceContext) return String(input || '').trim()
  return [
    editableSource,
    'REFERENCE CONTEXT — the email thread this draft replies to. Read only: use it to understand the draft; never edit, quote, summarize, or include it in the answer.',
    `<<<CONTEXT\n${referenceContext.slice(0, 8_000)}\nCONTEXT`,
  ].join('\n\n')
}
