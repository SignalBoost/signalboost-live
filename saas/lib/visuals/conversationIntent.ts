import { isConciergeVisualObjective } from './intent.ts'

type ConversationMessage = Readonly<{ role?: unknown; content?: unknown }>

const VISUAL_FOLLOWUP = /\b(?:better|more\s+creative|redo|try\s+again|another|revise|refine|improve|change|adjust|version|design|look|style|logo|visual|image|mark|wordmark|that|it)\b/i
const NEW_UNRELATED_REQUEST = /\b(?:employer|weather|date|time|email|message|code|bug|error|price|news)\b/i

/**
 * Resolves elliptical visual follow-ups against user-authored conversation history.
 * Assistant prose is never treated as authority: only an earlier explicit user visual
 * request can supply the missing referent.
 */
export function resolveConciergeVisualObjective(
  messages: readonly ConversationMessage[],
  latestPrompt: string,
): string | null {
  const latest = String(latestPrompt || '').trim()
  if (!latest) return null
  if (isConciergeVisualObjective(latest)) return latest
  if (!VISUAL_FOLLOWUP.test(latest) || NEW_UNRELATED_REQUEST.test(latest)) return null

  for (let index = messages.length - 2; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user' || typeof message.content !== 'string') continue
    const prior = message.content.trim()
    if (!prior || !isConciergeVisualObjective(prior)) continue
    return `${prior}\n\nFOLLOW-UP REVISION:\n${latest}`
  }
  return null
}
