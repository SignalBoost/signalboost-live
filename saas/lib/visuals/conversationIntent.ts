type ConversationMessage = Readonly<{ role?: unknown; content?: unknown }>

const MAX_USER_TURNS = 6
const MAX_CONTEXT_CHARS = 6000
const MAX_OBJECTIVE_CHARS = 8000

/**
 * Structural safety helper only. It does not decide what a user means.
 *
 * The semantic/deep-learning classifier owns the intent decision. This helper merely
 * provides a bounded, user-authored transcript so assistant prose cannot become routing
 * authority and stale unlimited history cannot leak into a paid generation decision.
 */
export function boundedRecentUserTurns(
  messages: readonly ConversationMessage[],
  latestPrompt: string,
): readonly string[] {
  const latest = String(latestPrompt || '').trim()
  if (!latest) return Object.freeze([])

  const reversed: string[] = []
  let chars = 0

  for (let index = messages.length - 1; index >= 0 && reversed.length < MAX_USER_TURNS; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user' || typeof message.content !== 'string') continue
    const content = message.content.trim()
    if (!content) continue

    const additional = content.length + (reversed.length ? 2 : 0)
    if (reversed.length > 0 && chars + additional > MAX_CONTEXT_CHARS) break
    reversed.push(content)
    chars += additional
  }

  const turns = reversed.reverse()
  if (turns.length === 0 || turns.at(-1) !== latest) {
    return Object.freeze([latest.slice(0, MAX_CONTEXT_CHARS)])
  }
  return Object.freeze([...turns])
}

/**
 * Once the semantic classifier identifies the visual-thread anchor, compose the exact
 * user-authored instructions without asking the model to rewrite or embellish them.
 */
export function composeUserAuthoredVisualObjective(
  turns: readonly string[],
  anchorUserTurn: number,
): string | null {
  if (!Number.isInteger(anchorUserTurn) || anchorUserTurn < 0 || anchorUserTurn >= turns.length) return null
  const selected = turns.slice(anchorUserTurn).map((turn) => String(turn || '').trim()).filter(Boolean)
  if (selected.length === 0) return null

  const [anchor, ...followups] = selected
  const objective = followups.length
    ? `${anchor}\n\nFOLLOW-UP USER INSTRUCTIONS:\n${followups.join('\n')}`
    : anchor
  return objective.length <= MAX_OBJECTIVE_CHARS ? objective : null
}
