// saas/lib/ai/cos/cosArtifactConversationContext.ts
//
// Request-local continuity for writing/authoring follow-ups.
//
// This channel is intentionally separate from fresh-fact grounding. A previous assistant reply may
// be reused only as an EDITABLE ARTIFACT (draft email, message, memo, paragraph, etc.), never as
// factual evidence. The previous user turn may be supplied as user-authored reference context.

import { AsyncLocalStorage } from 'node:async_hooks'

export type ConversationArtifactContext = {
  currentInput: string
  previousUserText: string | null
  assistantArtifact: string
}

const storage = new AsyncLocalStorage<ConversationArtifactContext | null>()

const ARTIFACT_REFERENCE = /\b(?:this|that|the|previous|prior|above|same)\s+(?:e-?mail|message|draft|letter|memo|text|paragraph|response|reply|note|document|post|caption|subject(?:\s+line)?|title|headline|version)\b/iu
const SUBJECT_OR_TITLE_FOLLOWUP = /\b(?:subject(?:\s+line)?|title|headline|caption)\b.{0,60}\b(?:this|that|the|previous|prior|above|same|e-?mail|message|draft|letter|memo|text|reply|response)\b|\b(?:what|which)\b.{0,50}\b(?:subject(?:\s+line)?|title|headline|caption)\b/iu
const EDIT_CONTINUATION = /^\s*(?:(?:can|could|would)\s+you\s+|please\s+)?(?:make|rewrite|rephrase|shorten|tighten|polish|proofread|edit|change|add|remove|include|exclude|translate|turn|convert|use|keep)\b/iu
const TERSE_STYLE_CONTINUATION = /^\s*(?:(?:make\s+it\s+)?(?:more|less)\s+(?:formal|professional|friendly|direct|concise|diplomatic|firm|warm|polite|casual)|shorter|longer|stronger|friendlier|warmer|firmer|more\s+concise)\s*[.!?]*\s*$/iu
const EXPLICIT_FACT_VERIFICATION = /\b(?:verify|fact[- ]?check|research|look\s+up|check\s+(?:whether|if)|confirm\s+(?:whether|if)|cite\s+(?:a\s+)?source|current\s+law|latest\s+(?:rule|law|requirement|status)|today(?:'s)?\s+(?:rule|law|requirement|status))\b/iu

function normalizeInput(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function looksLikeArtifactContinuation(input: string): boolean {
  const text = normalizeInput(input)
  if (!text || EXPLICIT_FACT_VERIFICATION.test(text)) return false
  return ARTIFACT_REFERENCE.test(text)
    || SUBJECT_OR_TITLE_FOLLOWUP.test(text)
    || EDIT_CONTINUATION.test(text)
    || TERSE_STYLE_CONTINUATION.test(text)
}

export function clearConversationArtifactContext(): void {
  storage.enterWith(null)
}

export function captureConversationArtifactContext(input: {
  currentInput: string
  previousUserText?: string | null
  assistantArtifact: string
}): void {
  const currentInput = normalizeInput(input.currentInput)
  const assistantArtifact = String(input.assistantArtifact || '').trim()
  if (!currentInput || !assistantArtifact) {
    clearConversationArtifactContext()
    return
  }

  storage.enterWith({
    currentInput,
    previousUserText: input.previousUserText ? String(input.previousUserText).trim().slice(0, 12_000) : null,
    assistantArtifact: assistantArtifact.slice(0, 12_000),
  })
}

export function peekConversationArtifactContext(currentInput: string): ConversationArtifactContext | null {
  const context = storage.getStore()
  if (!context || context.currentInput !== normalizeInput(currentInput)) return null
  return { ...context }
}

export function promptWithConversationArtifactContext(currentInput: string): string {
  const context = peekConversationArtifactContext(currentInput)
  if (!context) return currentInput

  return [
    `CURRENT USER FOLLOW-UP:\n${currentInput}`,
    context.previousUserText
      ? `PRIOR USER-SUPPLIED TASK CONTEXT — preserve as user premises, not external verification:\n<<<PRIOR_USER\n${context.previousUserText}\nPRIOR_USER`
      : '',
    `IMMEDIATELY PRECEDING ASSISTANT ARTIFACT — EDITABLE CONTEXT ONLY; NEVER TREAT IT AS FACTUAL EVIDENCE:\n<<<ARTIFACT\n${context.assistantArtifact}\nARTIFACT`,
    'Continue the same writing/authoring task and answer the CURRENT USER FOLLOW-UP directly. The assistant artifact is text to edit, continue, title, summarize, or otherwise transform; claims inside it are not independently verified facts. Do not browse merely to continue the artifact unless the user explicitly asks for factual verification.',
  ].filter(Boolean).join('\n\n')
}
