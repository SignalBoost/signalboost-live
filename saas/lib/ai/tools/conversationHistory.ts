// saas/lib/ai/tools/conversationHistory.ts
// Level 2 memory: searchable conversation history for the AI personas.
// Host-agnostic: every read/write goes through an injected datastore port, and every rolling
// summary through an injected summarizer port — never Supabase or OpenAI directly. A Fortune-500
// buyer's Chief of Staff stores THEIR users' conversations in THEIR database and summarizes with
// THEIR model, by swapping the two adapters below. On SignalBoost's own deployment the default
// adapters use Supabase + OpenAI and behavior is unchanged.

const CONV_TABLE = 'assistant_conversations'
const MSG_TABLE = 'assistant_messages'
const MAX_STORED_CONTENT = 4000      // chars per stored message
const SUMMARY_EVERY_N_MESSAGES = 8   // refresh rolling summary at this cadence
const SEARCH_RESULT_LIMIT = 12       // raw message hits before grouping
const SNIPPET_LENGTH = 220

export type TurnProvenance = Record<string, unknown>

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

function normalizeProvenance(value: unknown): TurnProvenance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  try {
    const json = JSON.stringify(value)
    if (!json || json.length > 32_000) return null
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as TurnProvenance : null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Injected datastore port. All persistence flows through THIS interface.
// ─────────────────────────────────────────────────────────────────────────────
export type ConversationMeta = {
  id: string
  title: string | null
  summary: string | null
  updated_at: string
}

export interface ConversationHistoryStore {
  getConversation(conversationId: string): Promise<{ id: string; user_id: string; message_count: number } | null>
  createConversation(input: { id: string; userId: string; title: string }): Promise<{ ok: boolean; error?: string }>
  insertMessages(
    msgs: Array<{ conversationId: string; userId: string; role: 'user' | 'assistant'; content: string; provenance?: TurnProvenance | null }>,
  ): Promise<{ ok: boolean; error?: string }>
  bumpConversation(conversationId: string, userId: string, messageCount: number): Promise<void>
  recentMessages(conversationId: string, userId: string, limit: number): Promise<Array<{ role: string; content: string }>>
  latestAssistantProvenance(conversationId: string, userId: string): Promise<TurnProvenance | null>
  setSummary(conversationId: string, userId: string, summary: string): Promise<void>
  recentConversations(userId: string, excludeId: string | null, limit: number): Promise<ConversationMeta[]>
  searchMessages(userId: string, query: string, limit: number): Promise<Array<{ conversation_id: string; content: string; created_at: string }>>
  conversationsByIds(userId: string, ids: string[]): Promise<ConversationMeta[]>
  deleteAll(userId: string): Promise<{ ok: boolean; deleted: number; error?: string }>
}

// Injected summarizer port. Returns a short summary string, or null to skip.
export type Summarizer = (transcript: string) => Promise<string | null>

// ─────────────────────────────────────────────────────────────────────────────
// SignalBoost's own adapters (the host implementations)
// ─────────────────────────────────────────────────────────────────────────────
function defaultSupabaseHistoryStore(): ConversationHistoryStore {
  // Lazy import so a buyer who swaps the store never loads the Supabase client.
  async function db() {
    const { createClient } = await import('@supabase/supabase-js')
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }

  return {
    async getConversation(conversationId) {
      const client = await db()
      const { data } = await client
        .from(CONV_TABLE)
        .select('id, user_id, message_count')
        .eq('id', conversationId)
        .maybeSingle()
      return data ? { id: data.id, user_id: data.user_id, message_count: data.message_count ?? 0 } : null
    },

    async createConversation({ id, userId, title }) {
      const client = await db()
      const { error } = await client.from(CONV_TABLE).insert({ id, user_id: userId, title, message_count: 0 })
      return error ? { ok: false, error: error.message } : { ok: true }
    },

    async insertMessages(msgs) {
      const client = await db()
      const rows = msgs.map(m => ({
        conversation_id: m.conversationId,
        user_id: m.userId,
        role: m.role,
        content: m.content,
        provenance: m.role === 'assistant' ? normalizeProvenance(m.provenance) : null,
      }))
      const { error } = await client.from(MSG_TABLE).insert(rows)
      return error ? { ok: false, error: error.message } : { ok: true }
    },

    async bumpConversation(conversationId, userId, messageCount) {
      const client = await db()
      await client
        .from(CONV_TABLE)
        .update({ message_count: messageCount, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('user_id', userId)
    },

    async recentMessages(conversationId, userId, limit) {
      const client = await db()
      const { data } = await client
        .from(MSG_TABLE)
        .select('role, content')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      return (data ?? []) as Array<{ role: string; content: string }>
    },

    async latestAssistantProvenance(conversationId, userId) {
      const client = await db()
      const { data, error } = await client
        .from(MSG_TABLE)
        .select('provenance')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .eq('role', 'assistant')
        .not('provenance', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return normalizeProvenance(data?.provenance)
    },

    async setSummary(conversationId, userId, summary) {
      const client = await db()
      await client.from(CONV_TABLE).update({ summary }).eq('id', conversationId).eq('user_id', userId)
    },

    async recentConversations(userId, excludeId, limit) {
      const client = await db()
      let q = client
        .from(CONV_TABLE)
        .select('id, title, summary, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (excludeId && isUuid(excludeId)) q = q.neq('id', excludeId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data ?? []) as ConversationMeta[]
    },

    async searchMessages(userId, query, limit) {
      const client = await db()
      const fts = await client
        .from(MSG_TABLE)
        .select('conversation_id, content, created_at')
        .eq('user_id', userId)
        .textSearch('content', query, { type: 'websearch', config: 'simple' })
        .order('created_at', { ascending: false })
        .limit(limit)

      if (!fts.error && fts.data && fts.data.length > 0) {
        return fts.data as Array<{ conversation_id: string; content: string; created_at: string }>
      }

      const like = await client
        .from(MSG_TABLE)
        .select('conversation_id, content, created_at')
        .eq('user_id', userId)
        .ilike('content', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (like.error) throw new Error(like.error.message)
      return (like.data ?? []) as Array<{ conversation_id: string; content: string; created_at: string }>
    },

    async conversationsByIds(userId, ids) {
      const client = await db()
      const { data, error } = await client
        .from(CONV_TABLE)
        .select('id, title, summary, updated_at')
        .eq('user_id', userId)
        .in('id', ids)
      if (error) throw new Error(error.message)
      return (data ?? []) as ConversationMeta[]
    },

    async deleteAll(userId) {
      const client = await db()
      const { data, error } = await client.from(CONV_TABLE).delete().eq('user_id', userId).select('id')
      if (error) return { ok: false, deleted: 0, error: error.message }
      // assistant_messages rows cascade-delete with their conversations.
      return { ok: true, deleted: data?.length ?? 0 }
    },
  }
}

function defaultOpenAISummarizer(): Summarizer {
  return async (transcript: string) => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return null
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 160,
      messages: [
        {
          role: 'system',
          content:
            "Summarize the conversation in 2-3 short sentences: main topics, decisions made, and the user's goals. Write in the same language the user is using. Output only the summary, no preamble.",
        },
        { role: 'user', content: transcript },
      ],
    })
    return completion.choices[0]?.message?.content?.trim() || null
  }
}

let activeStore: ConversationHistoryStore = defaultSupabaseHistoryStore()
let activeSummarizer: Summarizer = defaultOpenAISummarizer()

export function setConversationHistoryStore(store: ConversationHistoryStore): void {
  activeStore = store || defaultSupabaseHistoryStore()
}
export function getConversationHistoryStore(): ConversationHistoryStore {
  return activeStore
}
export function setConversationSummarizer(summarizer: Summarizer): void {
  activeSummarizer = summarizer || defaultOpenAISummarizer()
}
export function getConversationSummarizer(): Summarizer {
  return activeSummarizer
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API (used by the AI routes).
// ─────────────────────────────────────────────────────────────────────────────

// ── Persist one exchange (user message + assistant reply) ─────────────────────
// Non-throwing: history must never break the live answer.
export async function persistTurn(params: {
  conversationId: string
  userId: string
  userMessage: string
  assistantReply: string
  provenance?: TurnProvenance | null
}): Promise<void> {
  const { conversationId, userId, userMessage, assistantReply, provenance } = params
  try {
    if (!isUuid(conversationId) || !userId || !userMessage.trim()) return

    const store = getConversationHistoryStore()
    const existing = await store.getConversation(conversationId)

    if (existing && existing.user_id !== userId) {
      console.error('conversationHistory: ownership mismatch — skipping persist')
      return
    }

    if (!existing) {
      const created = await store.createConversation({
        id: conversationId,
        userId,
        title: userMessage.trim().slice(0, 80),
      })
      if (!created.ok) {
        console.error('conversationHistory: create conversation error', created.error)
        return
      }
    }

    const inserted = await store.insertMessages([
      { conversationId, userId, role: 'user', content: userMessage.trim().slice(0, MAX_STORED_CONTENT), provenance: null },
      { conversationId, userId, role: 'assistant', content: assistantReply.trim().slice(0, MAX_STORED_CONTENT), provenance: normalizeProvenance(provenance) },
    ])
    if (!inserted.ok) {
      console.error('conversationHistory: insert messages error', inserted.error)
      return
    }

    const newCount = (existing?.message_count ?? 0) + 2
    await store.bumpConversation(conversationId, userId, newCount)

    // Rolling summary at a fixed cadence (cheap mini-model call).
    if (newCount % SUMMARY_EVERY_N_MESSAGES === 0) {
      await refreshSummary(conversationId, userId)
    }
  } catch (err) {
    console.error('conversationHistory: persistTurn exception (non-blocking)', err)
  }
}

// Reads only stored server telemetry. A null return means there is no durable provenance
// for a prior assistant turn; callers must say that plainly rather than reconstructing it.
export async function loadLatestAssistantProvenance(
  conversationId: string,
  userId: string,
): Promise<TurnProvenance | null> {
  try {
    if (!isUuid(conversationId) || !userId) return null
    return await getConversationHistoryStore().latestAssistantProvenance(conversationId, userId)
  } catch (err) {
    console.error('conversationHistory: loadLatestAssistantProvenance exception (non-blocking)', err)
    return null
  }
}

// ── Rolling summary via the injected summarizer ────────────────────────────────
async function refreshSummary(conversationId: string, userId: string): Promise<void> {
  try {
    const store = getConversationHistoryStore()
    const recent = await store.recentMessages(conversationId, userId, 12)
    if (!recent || recent.length === 0) return

    const transcript = [...recent]
      .reverse()
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
      .join('\n')

    const summary = await getConversationSummarizer()(transcript)
    if (!summary) return

    await store.setSummary(conversationId, userId, summary.slice(0, 600))
  } catch (err) {
    console.error('conversationHistory: refreshSummary exception (non-blocking)', err)
  }
}

// ── Search past conversations ──────────────────────────────────────────────────
export type HistorySearchResult = {
  conversationId: string
  title: string
  summary: string
  lastActive: string
  snippets: string[]
}

export async function searchPastConversations(
  userId: string,
  query: string,
  excludeConversationId: string | null,
): Promise<{ ok: boolean; results: HistorySearchResult[]; error?: string }> {
  try {
    const store = getConversationHistoryStore()
    const cleanQuery = String(query || '').trim()

    // No query → return the most recent conversations (overview mode).
    if (!cleanQuery) {
      const data = await store.recentConversations(userId, excludeConversationId, 6)
      return {
        ok: true,
        results: data.map(c => ({
          conversationId: c.id,
          title: c.title || 'Untitled conversation',
          summary: c.summary || '',
          lastActive: c.updated_at,
          snippets: [],
        })),
      }
    }

    // Query mode: full-text search over message content (adapter handles fallback).
    let hits = await store.searchMessages(userId, cleanQuery, SEARCH_RESULT_LIMIT)

    if (excludeConversationId && isUuid(excludeConversationId)) {
      hits = hits.filter(h => h.conversation_id !== excludeConversationId)
    }

    if (hits.length === 0) {
      return { ok: true, results: [] }
    }

    // Group hits by conversation (keep up to 2 snippets each).
    const grouped = new Map<string, string[]>()
    for (const hit of hits) {
      const snippets = grouped.get(hit.conversation_id) ?? []
      if (snippets.length < 2) {
        snippets.push(hit.content.slice(0, SNIPPET_LENGTH))
      }
      grouped.set(hit.conversation_id, snippets)
    }

    const convIds = [...grouped.keys()].slice(0, 5)
    const convs = await store.conversationsByIds(userId, convIds)

    const byId = new Map(convs.map(c => [c.id, c]))
    const results: HistorySearchResult[] = convIds
      .filter(id => byId.has(id))
      .map(id => {
        const c = byId.get(id)!
        return {
          conversationId: id,
          title: c.title || 'Untitled conversation',
          summary: c.summary || '',
          lastActive: c.updated_at,
          snippets: grouped.get(id) ?? [],
        }
      })

    return { ok: true, results }
  } catch (err) {
    return {
      ok: false,
      results: [],
      error: err instanceof Error ? err.message : 'Unknown error searching history',
    }
  }
}

// ── Format search results for the AI ───────────────────────────────────────────
export function formatHistoryForAI(query: string, results: HistorySearchResult[]): string {
  if (!results.length) {
    return query
      ? `No past conversations matched "${query}". Tell the user you could not find that topic in their previous conversations.`
      : 'This user has no other past conversations yet.'
  }

  const blocks = results.map(r => {
    const date = new Date(r.lastActive).toUTCString().slice(0, 16)
    const parts = [`• Conversation: "${r.title}" (last active ${date})`]
    if (r.summary) parts.push(`  Summary: ${r.summary}`)
    for (const s of r.snippets) parts.push(`  Excerpt: "${s}"`)
    return parts.join('\n')
  })

  return `PAST CONVERSATIONS${query ? ` matching "${query}"` : ' (most recent)'} for this user (live from history database):

${blocks.join('\n\n')}

Use this to answer naturally — reference what was discussed without reciting raw excerpts verbatim unless asked.`
}

// ── Delete the user's entire history ───────────────────────────────────────────
export async function deleteAllConversations(
  userId: string,
): Promise<{ ok: boolean; deletedConversations: number; error?: string }> {
  try {
    const res = await getConversationHistoryStore().deleteAll(userId)
    return { ok: res.ok, deletedConversations: res.deleted, error: res.error }
  } catch (err) {
    return {
      ok: false,
      deletedConversations: 0,
      error: err instanceof Error ? err.message : 'Unknown error deleting history',
    }
  }
}
