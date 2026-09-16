// saas/lib/concierge/conversationResume.ts
// Returning signed-in users continue their Concierge conversation instead of starting from an empty chat.
//
// Scope, deliberately narrow:
//  - Only the conversation THIS Concierge surface started in THIS browser is resumed. The id is kept
//    per surface, so the public Concierge never pulls in an owner's dashboard/Builder threads.
//  - The transcript is read from the existing owner-scoped history API (/api/assistant/chats?id=),
//    which returns nothing unless the signed-in user owns the conversation. Anonymous visitors have
//    no saved turns, get a 401, and simply start fresh.
//  - "New chat" forgets the id, so the next question starts a new conversation.

export const CONCIERGE_RESUME_KEYS = Object.freeze({
  homepage: 'itmounts.concierge.homepage.conversationId',
  dock: 'itmounts.concierge.dock.conversationId',
})

export const CONCIERGE_RESUME_MAX_MESSAGES = 40

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ResumedMessage = { role: 'user' | 'assistant'; content: string }
export type ResumedTurn = { request: string; response: string }

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

export function readResumeId(key: string): string {
  try {
    const value = String(storage()?.getItem(key) || '').trim()
    return UUID.test(value) ? value : ''
  } catch { return '' }
}

export function rememberResumeId(key: string, conversationId: string): void {
  if (!UUID.test(conversationId)) return
  try { storage()?.setItem(key, conversationId) } catch { /* storage blocked: resume is best-effort */ }
}

export function forgetResumeId(key: string): void {
  try { storage()?.removeItem(key) } catch { /* storage blocked */ }
}

/** Keeps only plain user/assistant text, in stored order, bounded to the most recent messages. */
export function resumableMessages(raw: unknown): ResumedMessage[] {
  const rows = Array.isArray(raw) ? raw : []
  const messages = rows
    .filter((row: any) => (row?.role === 'user' || row?.role === 'assistant') && typeof row?.content === 'string' && row.content.trim())
    .map((row: any) => ({ role: row.role as 'user' | 'assistant', content: String(row.content) }))
  return messages.slice(-CONCIERGE_RESUME_MAX_MESSAGES)
}

/** Pairs each request with the answer that followed it; an unanswered trailing request is dropped. */
export function pairResumedTurns(messages: readonly ResumedMessage[]): ResumedTurn[] {
  const turns: ResumedTurn[] = []
  let pending = ''
  for (const message of messages) {
    if (message.role === 'user') { pending = message.content; continue }
    if (pending) { turns.push({ request: pending, response: message.content }); pending = '' }
  }
  return turns
}

/** null means "do not resume" (not signed in, not found, or unreadable); the caller forgets the id. */
export async function loadResumableConversation(conversationId: string, fetchImpl: typeof fetch = fetch): Promise<ResumedMessage[] | null> {
  if (!UUID.test(conversationId)) return null
  try {
    const response = await fetchImpl(`/api/assistant/chats?id=${encodeURIComponent(conversationId)}`, { cache: 'no-store', credentials: 'same-origin' })
    if (!response.ok) return null
    const payload = await response.json().catch(() => null) as { messages?: unknown; missing?: boolean } | null
    if (!payload || payload.missing) return null
    const messages = resumableMessages(payload.messages)
    return messages.length ? messages : null
  } catch { return null }
}
