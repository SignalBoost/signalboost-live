// saas/lib/ai/cos/cosArtifactConversationContext.ts
//
// Request-local continuity for writing/authoring follow-ups.
//
// This channel is intentionally separate from fresh-fact grounding. A previous assistant reply may
// be reused only as an EDITABLE ARTIFACT (draft email, message, memo, paragraph, etc.), never as
// factual evidence. The previous user turn may be supplied as user-authored reference context.

import { AsyncLocalStorage } from 'node:async_hooks'
import { looksLikeArtifactContinuation } from './artifactContinuationIntent.ts'

export { looksLikeArtifactContinuation } from './artifactContinuationIntent.ts'

export type ConversationArtifactContext = {
  currentInput: string
  previousUserText: string | null
  assistantArtifact: string
}

const storage = new AsyncLocalStorage<ConversationArtifactContext | null>()

function normalizeInput(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
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
  if (!currentInput || !assistantArtifact || !looksLikeArtifactContinuation(currentInput)) {
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
