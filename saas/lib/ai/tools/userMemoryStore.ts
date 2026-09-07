// saas/lib/ai/tools/userMemoryStore.ts
// Single source of truth for the AI's long-term memory of a user.
// Every read/write goes through the injected store port (never Supabase directly), so a
// Fortune-500 buyer's Chief of Staff remembers THEIR users' facts in THEIR own database via
// one adapter. On SignalBoost's own deployment the default adapter uses Supabase, unchanged.
import { createClient } from '@supabase/supabase-js'
import { searchPastConversations } from './conversationHistory.ts'
import { isPublicDeliveryScope } from '@/lib/auth/publicDeliveryScope'

export type UserMemory = { id: string; kind: string; content: string; created_at: string }

export interface UserMemoryStore {
  list(userId: string, limit: number): Promise<UserMemory[]>
  findDuplicate(userId: string, content: string): Promise<boolean>
  listAllOrdered(userId: string): Promise<{ id: string; created_at: string }[]>
  deleteIds(ids: string[]): Promise<void>
  insert(userId: string, kind: string, content: string): Promise<{ ok: boolean; error?: string }>
  deleteMatching(userId: string, phrase: string): Promise<{ ok: boolean; deleted: number; error?: string }>
}

// ── SignalBoost's own adapter (the host implementation) ──
const TABLE = 'assistant_memories'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function defaultSupabaseMemoryStore(): UserMemoryStore {
  return {
    async list(userId, limit) {
      const { data, error } = await db().from(TABLE).select('id, kind, content, created_at')
        .eq('user_id', userId).order('created_at', { ascending: true }).limit(limit)
      if (error) { console.error('userMemory: load error', error.message); return [] }
      return (data ?? []) as UserMemory[]
    },
    async findDuplicate(userId, content) {
      const { data } = await db().from(TABLE).select('id').eq('user_id', userId).eq('content', content).limit(1)
      return Boolean(data && data.length > 0)
    },
    async listAllOrdered(userId) {
      const { data } = await db().from(TABLE).select('id, created_at').eq('user_id', userId).order('created_at', { ascending: true })
      return data ?? []
    },
    async deleteIds(ids) {
      if (!ids.length) return
      await db().from(TABLE).delete().in('id', ids)
    },
    async insert(userId, kind, content) {
      const { error } = await db().from(TABLE).insert({ user_id: userId, kind, content })
      return error ? { ok: false, error: error.message } : { ok: true }
    },
    async deleteMatching(userId, phrase) {
      const { data, error } = await db().from(TABLE).delete().eq('user_id', userId).ilike('content', `%${phrase}%`).select('id')
      if (error) return { ok: false, deleted: 0, error: error.message }
      return { ok: true, deleted: data?.length ?? 0 }
    },
  }
}

let active: UserMemoryStore = defaultSupabaseMemoryStore()

export function setUserMemoryStore(store: UserMemoryStore): void {
  active = store || defaultSupabaseMemoryStore()
}
export function getUserMemoryStore(): UserMemoryStore {
  return active
}

// ── Public memory API (used by the AI routes) ──
const MAX_MEMORIES_PER_USER = 30
const MAX_CONTENT_LENGTH = 300
const PUBLIC_RECENT_CONVERSATION_LIMIT = 6
const VALID_KINDS = new Set(['preference', 'fact', 'goal'])

function conversationContextMemories(results: Awaited<ReturnType<typeof searchPastConversations>>['results']): UserMemory[] {
  return results.slice(0, PUBLIC_RECENT_CONVERSATION_LIMIT).map(result => ({
    id: `conversation:${result.conversationId}`,
    kind: 'conversation',
    content: [result.title, result.summary].filter(Boolean).join(' — ').slice(0, 900),
    created_at: result.lastActive,
  })).filter(memory => memory.content.trim().length > 0)
}

export async function loadUserMemories(userId: string): Promise<UserMemory[]> {
  try {
    const saved = await getUserMemoryStore().list(userId, MAX_MEMORIES_PER_USER)

    // Concierge is only the public delivery surface; COS owns customer continuity. For an
    // authenticated public turn, expose a bounded read-only slice of THIS user's own recent
    // conversation history to the same COS user-memory ranking stage. The history adapter is
    // user-scoped, guests have no userId and never reach this function, and no owner/company
    // Enterprise Memory is opened by this path.
    if (!isPublicDeliveryScope()) return saved

    const history = await searchPastConversations(userId, '', null).catch(() => ({ ok: false as const, results: [] }))
    if (!history.ok || history.results.length === 0) return saved
    return [...saved, ...conversationContextMemories(history.results)]
  } catch (err) {
    console.error('userMemory: load exception', err)
    return []
  }
}

export function formatMemoriesForAI(memories: UserMemory[]): string {
  if (!memories.length) return ''
  const lines = memories.map(m => `- [${m.kind}] ${m.content}`)
  return `── SAVED USER MEMORIES (lasting facts from previous conversations with this user) ──
${lines.join('\n')}
── END MEMORIES ──`
}

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

    if (await store.findDuplicate(userId, cleanContent)) {
      return { ok: true }
    }

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
