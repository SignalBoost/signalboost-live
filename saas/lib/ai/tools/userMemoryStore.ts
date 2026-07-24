// saas/lib/ai/tools/userMemoryStore.ts
// Injected datastore seam for the AI's long-term memory of a user. Every read and write goes
// through THIS port, never Supabase directly, so a Fortune-500 buyer's Chief of Staff remembers
// THEIR users' facts in THEIR own database, with one adapter. On SignalBoost's own deployment
// the default adapter uses Supabase and behavior is unchanged.
import { createClient } from '@supabase/supabase-js'

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
