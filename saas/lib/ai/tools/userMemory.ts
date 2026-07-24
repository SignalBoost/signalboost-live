// saas/lib/ai/tools/userMemory.ts
// Long-term user memory for the AI personas.
// Stores lasting preferences, facts, and goals per logged-in user in the
// SaaS Supabase `assistant_memories` table, and loads them into the AI's
// context at the start of every conversation.

import { getUserMemoryStore } from './userMemoryStore'
export type { UserMemory } from './userMemoryStore'

const MAX_MEMORIES_PER_USER = 30
const MAX_CONTENT_LENGTH = 300

const VALID_KINDS = new Set(['preference', 'fact', 'goal'])

// ── Load all memories for a user (newest last, for natural reading) ───────────
export async function loadUserMemories(userId: string): Promise<UserMemory[]> {
  try {
    return await getUserMemoryStore().list(userId, MAX_MEMORIES_PER_USER)
  } catch (err) {
    console.error('userMemory: load exception', err)
    return []
  }
}

// ── Format memories for injection into the system prompt ──────────────────────
export function formatMemoriesForAI(memories: UserMemory[]): string {
  if (!memories.length) return ''
  const lines = memories.map(m => `- [${m.kind}] ${m.content}`)
  return `── SAVED USER MEMORIES (lasting facts from previous conversations with this user) ──
${lines.join('\n')}
── END MEMORIES ──`
}

// ── Save a new memory ──────────────────────────────────────────────────────────
export async function saveUserMemory(
  userId: string,
  kind: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cleanKind = String(kind || '').trim().toLowerCase()
    const cleanContent = String(content || '').trim().slice(0, MAX_CONTENT_LENGTH)

    if (!VALID_KINDS.has(cleanKind)) {
      return { ok: false, error: `Invalid kind "${kind}" — must be preference, fact, or goal.` }
    }
    if (!cleanContent) {
      return { ok: false, error: 'Memory content is empty.' }
    }

    const store = getUserMemoryStore()

    // Skip exact duplicates
    if (await store.findDuplicate(userId, cleanContent)) {
      return { ok: true } // already remembered — treat as success
    }

    // Enforce per-user cap: delete the oldest if at the limit
    const all = await store.listAllOrdered(userId)
    if (all.length >= MAX_MEMORIES_PER_USER) {
      const toDelete = all.slice(0, all.length - MAX_MEMORIES_PER_USER + 1).map(r => r.id)
      await store.deleteIds(toDelete)
    }

    return await store.insert(userId, cleanKind, cleanContent)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error saving memory' }
  }
}

// ── Forget memories matching a phrase ──────────────────────────────────────────
export async function forgetUserMemory(
  userId: string,
  match: string,
): Promise<{ ok: boolean; deleted: number; error?: string }> {
  try {
    const phrase = String(match || '').trim()
    if (!phrase) {
      return { ok: false, deleted: 0, error: 'No phrase given to forget.' }
    }

    return await getUserMemoryStore().deleteMatching(userId, phrase)
  } catch (err) {
    return { ok: false, deleted: 0, error: err instanceof Error ? err.message : 'Unknown error forgetting memory' }
  }
}
