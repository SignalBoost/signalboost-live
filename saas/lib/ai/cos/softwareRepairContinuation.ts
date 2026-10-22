import { isSoftwareRepairRequest } from './softwareRepairIntent.ts'

const FOLLOW_UP = /^(?:go|yes|yes,?\s*(?:do it|fix it|proceed)|fix it|repair it|do it|proceed|continue|try again|please fix it)[.!\s]*$/i
const SOURCE_REQUEST = /(?:I can fix that\. Attach the file|send (?:the )?link to a public GitHub repository)/i

/**
 * Recover a narrowly scoped owner repair request after COS mistakenly asked for source.
 * Chat messages alone never grant repository authority: callers must also check the
 * authenticated owner, deployed repository identity, and an executable target.
 */
export function pendingOwnerSoftwareRepair(messages: readonly unknown[], latestPrompt: string): string | null {
  if (!FOLLOW_UP.test(latestPrompt.trim())) return null
  const history = messages.filter((value): value is { role: string; content: string } =>
    !!value && typeof value === 'object'
    && typeof (value as { role?: unknown }).role === 'string'
    && typeof (value as { content?: unknown }).content === 'string')
  const last = history.at(-1)
  if (last?.role !== 'user' || last.content !== latestPrompt) return null
  const prior = history.at(-2)
  if (prior?.role !== 'assistant' || !SOURCE_REQUEST.test(prior.content)) return null
  const earlier = history.slice(0, -2).filter(message => message.role === 'user')
  const request = earlier.at(-1)?.content?.trim() || ''
  return request && isSoftwareRepairRequest(request) ? request.slice(0, 4000) : null
}
