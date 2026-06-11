// saas/lib/ai/tools/userMemory.ts
// Long-term user memory for the AI personas.
// Stores lasting preferences, facts, and goals per logged-in user in the
// SaaS Supabase `assistant_memories` table, and loads them into the AI's
// context at the start of every conversation.

import { createClient } from '@supabase/supabase-js'

const MEMORIES_TABLE = 'assistant_memories'
const MAX_MEMORIES_PER_USER = 30
const MAX_CONTENT_LENGTH = 300

const VALID_KINDS = new Set(['preference', 'fact', 'goal'])

export type UserMemory = {
  id: string
  kind: string
  content: string
  created_at: string
}

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Load all memories for a user (newest last, for natural reading) ───────────
export async function loadUserMemories(userId: string): Promise<UserMemory[]> {
  try {
    const db = supabaseAdmin()
    const { data, error } = await db
      .from(MEMORIES_TABLE)
      .select('id, kind, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(MAX_MEMORIES_PER_USER)

    if (error) {
      console.error('userMemory: load error', error.message)
      return []
    }
    return (data ?? []) as UserMemory[]
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

    const db = supabaseAdmin()

    // Skip exact duplicates
    const { data: existing } = await db
      .from(MEMORIES_TABLE)
      .select('id')
      .eq('user_id', userId)
      .eq('content', cleanContent)
      .limit(1)

    if (existing && existing.length > 0) {
      return { ok: true } // already remembered — treat as success
    }

    // Enforce per-user cap: delete the oldest if at the limit
    const { data: all } = await db
      .from(MEMORIES_TABLE)
      .select('id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (all && all.length >= MAX_MEMORIES_PER_USER) {
      const toDelete = all.slice(0, all.length - MAX_MEMORIES_PER_USER + 1).map(r => r.id)
      await db.from(MEMORIES_TABLE).delete().in('id', toDelete)
    }

    const { error } = await db.from(MEMORIES_TABLE).insert({
      user_id: userId,
      kind: cleanKind,
      content: cleanContent,
    })

    if (error) {
      return { ok: false, error: error.message }
    }
    return { ok: true }
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

    const db = supabaseAdmin()
    const { data, error } = await db
      .from(MEMORIES_TABLE)
      .delete()
      .eq('user_id', userId)
      .ilike('content', `%${phrase}%`)
      .select('id')

    if (error) {
      return { ok: false, deleted: 0, error: error.message }
    }
    return { ok: true, deleted: data?.length ?? 0 }
  } catch (err) {
    return { ok: false, deleted: 0, error: err instanceof Error ? err.message : 'Unknown error forgetting memory' }
  }
}
