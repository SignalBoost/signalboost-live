// Resolve context-dependent fresh-fact follow-ups without consulting model memory.
//
// The fresh-data path is deliberately fail-closed, but a follow-up like "when did she die?"
// is not a complete web query by itself. This module carries forward only the user's own
// immediately preceding message for factual lookup. Assistant text is never trusted as a factual
// referent. A separate request-local channel may capture the prior assistant reply only when the
// new turn is clearly continuing a writing artifact.

import {
  captureConversationArtifactContext,
  clearConversationArtifactContext,
  looksLikeArtifactContinuation,
} from './cosArtifactConversationContext.ts'

export type FreshConversationResolution = {
  originalInput: string
  lookupInput: string
  contextUsed: boolean
  previousUserText: string | null
}

const THIRD_PERSON_REFERENCE = /\b(?:he|she|they|him|her|them|his|hers|their|theirs|it|its|that\s+person|this\s+person|that\s+company|that\s+organization|that\s+organisation|él|ella|ellos|ellas|ele|ela|eles|elas|on|ona|oni|one|он|она|они)\b/iu
const ELLIPTICAL_FOLLOW_UP = /^\s*(?:when|where|what\s+about|and\s+when|and\s+where|quando|cuándo|kiedy|gdzie|когда|где)\s*[?.!]*\s*$/iu

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content.map((block: any) => String(block?.text || '').trim()).filter(Boolean).join('\n').trim()
}

function priorUserText(body: any, currentInput: string): string | null {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  let skippedCurrent = false
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'user') continue
    const text = textFromContent(messages[index]?.content)
    if (!text) continue
    if (!skippedCurrent && text === currentInput.trim()) {
      skippedCurrent = true
      continue
    }
    if (!skippedCurrent) {
      // The latest user message may have been normalized differently by the caller. Skip it once.
      skippedCurrent = true
      continue
    }
    return text.slice(0, 12_000)
  }
  return null
}

function priorAssistantText(body: any): string | null {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'assistant') continue
    const text = textFromContent(messages[index]?.content)
    if (text) return text.slice(0, 12_000)
  }
  return null
}

export function resolveFreshConversationContext(body: any, input: string): FreshConversationResolution {
  clearConversationArtifactContext()

  const originalInput = String(input || '').replace(/\s+/g, ' ').trim()
  if (!originalInput) return { originalInput: '', lookupInput: '', contextUsed: false, previousUserText: null }

  const previousUserText = priorUserText(body, originalInput)
  if (looksLikeArtifactContinuation(originalInput)) {
    const assistantArtifact = priorAssistantText(body)
    if (assistantArtifact) {
      captureConversationArtifactContext({ currentInput: originalInput, previousUserText, assistantArtifact })
    }
  }

  const dependsOnPriorTurn = THIRD_PERSON_REFERENCE.test(originalInput) || ELLIPTICAL_FOLLOW_UP.test(originalInput)
  if (!dependsOnPriorTurn) {
    return { originalInput, lookupInput: originalInput, contextUsed: false, previousUserText: null }
  }

  if (!previousUserText) {
    return { originalInput, lookupInput: originalInput, contextUsed: false, previousUserText: null }
  }

  const lookupInput = `Previous user context: ${previousUserText.slice(0, 320)}\nCurrent follow-up question: ${originalInput}`.slice(0, 650)
  return { originalInput, lookupInput, contextUsed: true, previousUserText: previousUserText.slice(0, 320) }
}
