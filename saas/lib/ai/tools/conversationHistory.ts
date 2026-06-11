// saas/lib/ai/tools/conversationHistory.ts
// Level 2 memory: searchable conversation history for the AI personas.
// Persists every exchange to the SaaS Supabase, auto-titles conversations,
// maintains a short rolling summary, and provides full-text search so the
// assistant can recall past discussions ("what did we talk about last week?").

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const CONV_TABLE = 'assistant_conversations'
const MSG_TABLE = 'assistant_messages'
const MAX_STORED_CONTENT = 4000      // chars per stored message
const SUMMARY_EVERY_N_MESSAGES = 8   // refresh rolling summary at this cadence
const SEARCH_RESULT_LIMIT = 12       // raw message hits before grouping
const SNIPPET_LENGTH = 220

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

// ── Persist one exchange (user message + assistant reply) ─────────────────────
// Non-throwing: history must never break the live answer.
export async function persistTurn(params: {
  conversationId: string
  userId: string
  userMessage: string
  assistantReply: string
}): Promise<void> {
  const { conversationId, userId, userMessage, assistantReply } = params
  try {
    if (!isUuid(conversationId) || !userId || !userMessage.trim()) return

    const db = supabaseAdmin()

    // Load or create the conversation — and verify ownership.
    const { data: existing } = await db
      .from(CONV_TABLE)
      .select('id, user_id, message_count')
      .eq('id', conversationId)
      .maybeSingle()

    if (existing && existing.user_id !== userId) {
      console.error('conversationHistory: ownership mismatch — skipping persist')
      return
    }

    if (!existing) {
      const { error: convError } = await db.from(CONV_TABLE).insert({
        id: conversationId,
        user_id: userId,
        title: userMessage.trim().slice(0, 80),
        message_count: 0,
      })
      if (convError) {
        console.error('conversationHistory: create conversation error', convError.message)
        return
      }
    }

    const { error: msgError } = await db.from(MSG_TABLE).insert([
      {
        conversation_id: conversationId,
        user_id: userId,
        role: 'user',
        content: userMessage.trim().slice(0, MAX_STORED_CONTENT),
      },
      {
        conversation_id: conversationId,
        user_id: userId,
        role: 'assistant',
        content: assistantReply.trim().slice(0, MAX_STORED_CONTENT),
      },
    ])
    if (msgError) {
      console.error('conversationHistory: insert messages error', msgError.message)
      return
    }

    const newCount = (existing?.message_count ?? 0) + 2
    await db
      .from(CONV_TABLE)
      .update({ message_count: newCount, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('user_id', userId)

    // Rolling summary at a fixed cadence (cheap mini-model call).
    if (newCount % SUMMARY_EVERY_N_MESSAGES === 0) {
      await refreshSummary(conversationId, userId)
    }
  } catch (err) {
    console.error('conversationHistory: persistTurn exception (non-blocking)', err)
  }
}

// ── Rolling summary via gpt-4o-mini ────────────────────────────────────────────
async function refreshSummary(conversationId: string, userId: string): Promise<void> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return

    const db = supabaseAdmin()
    const { data: recent } = await db
      .from(MSG_TABLE)
      .select('role, content')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(12)

    if (!recent || recent.length === 0) return

    const transcript = [...recent]
      .reverse()
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
      .join('\n')

    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 160,
      messages: [
        {
          role: 'system',
          content: 'Summarize the conversation in 2-3 short sentences: main topics, decisions made, and the user\'s goals. Write in the same language the user is using. Output only the summary, no preamble.',
        },
        { role: 'user', content: transcript },
      ],
    })

    const summary = completion.choices[0]?.message?.content?.trim()
    if (!summary) return

    await db
      .from(CONV_TABLE)
      .update({ summary: summary.slice(0, 600) })
      .eq('id', conversationId)
      .eq('user_id', userId)
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
    const db = supabaseAdmin()
    const cleanQuery = String(query || '').trim()

    // No query → return the most recent conversations (overview mode).
    if (!cleanQuery) {
      let convQuery = db
        .from(CONV_TABLE)
        .select('id, title, summary, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(6)
      if (excludeConversationId && isUuid(excludeConversationId)) {
        convQuery = convQuery.neq('id', excludeConversationId)
      }
      const { data, error } = await convQuery
      if (error) return { ok: false, results: [], error: error.message }

      return {
        ok: true,
        results: (data ?? []).map(c => ({
          conversationId: c.id,
          title: c.title || 'Untitled conversation',
          summary: c.summary || '',
          lastActive: c.updated_at,
          snippets: [],
        })),
      }
    }

    // Query mode: full-text search over message content, ilike fallback.
    let hits: Array<{ conversation_id: string; content: string; created_at: string }> = []

    const fts = await db
      .from(MSG_TABLE)
      .select('conversation_id, content, created_at')
      .eq('user_id', userId)
      .textSearch('content', cleanQuery, { type: 'websearch', config: 'simple' })
      .order('created_at', { ascending: false })
      .limit(SEARCH_RESULT_LIMIT)

    if (!fts.error && fts.data && fts.data.length > 0) {
      hits = fts.data
    } else {
      const like = await db
        .from(MSG_TABLE)
        .select('conversation_id, content, created_at')
        .eq('user_id', userId)
        .ilike('content', `%${cleanQuery}%`)
        .order('created_at', { ascending: false })
        .limit(SEARCH_RESULT_LIMIT)
      if (like.error) return { ok: false, results: [], error: like.error.message }
      hits = like.data ?? []
    }

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
    const { data: convs, error: convError } = await db
      .from(CONV_TABLE)
      .select('id, title, summary, updated_at')
      .eq('user_id', userId)
      .in('id', convIds)

    if (convError) return { ok: false, results: [], error: convError.message }

    const byId = new Map((convs ?? []).map(c => [c.id, c]))
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
    const db = supabaseAdmin()
    const { data, error } = await db
      .from(CONV_TABLE)
      .delete()
      .eq('user_id', userId)
      .select('id')

    if (error) return { ok: false, deletedConversations: 0, error: error.message }
    // assistant_messages rows cascade-delete with their conversations.
    return { ok: true, deletedConversations: data?.length ?? 0 }
  } catch (err) {
    return {
      ok: false,
      deletedConversations: 0,
      error: err instanceof Error ? err.message : 'Unknown error deleting history',
    }
  }
}
