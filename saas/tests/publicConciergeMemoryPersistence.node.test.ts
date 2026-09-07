import assert from 'node:assert/strict'
import test from 'node:test'
import { getConversationHistoryStore, setConversationHistoryStore, persistTurn, searchPastConversations } from '../lib/ai/tools/conversationHistory.ts'
import type { ConversationHistoryStore, ConversationMeta } from '../lib/ai/tools/conversationHistory.ts'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const CONVERSATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

type StoredConversation = { id: string; user_id: string; title: string; summary: string | null; updated_at: string; message_count: number }
type StoredMessage = { conversationId: string; userId: string; role: 'user' | 'assistant'; content: string; created_at: string }

function memoryStore(): ConversationHistoryStore {
  const conversations = new Map<string, StoredConversation>()
  const messages: StoredMessage[] = []
  return {
    async getConversation(id) {
      const c = conversations.get(id)
      return c ? { id: c.id, user_id: c.user_id, message_count: c.message_count } : null
    },
    async createConversation({ id, userId, title }) {
      conversations.set(id, { id, user_id: userId, title, summary: null, updated_at: new Date().toISOString(), message_count: 0 })
      return { ok: true }
    },
    async insertMessages(input) {
      for (const m of input) messages.push({ conversationId: m.conversationId, userId: m.userId, role: m.role, content: m.content, created_at: new Date().toISOString() })
      return { ok: true }
    },
    async bumpConversation(id, userId, messageCount) {
      const c = conversations.get(id)
      if (c && c.user_id === userId) { c.message_count = messageCount; c.updated_at = new Date().toISOString() }
    },
    async recentMessages(id, userId, limit) {
      return messages.filter(m => m.conversationId === id && m.userId === userId).slice(-limit).reverse().map(m => ({ role: m.role, content: m.content }))
    },
    async setSummary(id, userId, summary) {
      const c = conversations.get(id)
      if (c && c.user_id === userId) c.summary = summary
    },
    async recentConversations(userId, excludeId, limit) {
      return [...conversations.values()]
        .filter(c => c.user_id === userId && c.id !== excludeId)
        .slice(0, limit)
        .map(c => ({ id: c.id, title: c.title, summary: c.summary, updated_at: c.updated_at } satisfies ConversationMeta))
    },
    async searchMessages(userId, query, limit) {
      return messages
        .filter(m => m.userId === userId && m.content.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit)
        .map(m => ({ conversation_id: m.conversationId, content: m.content, created_at: m.created_at }))
    },
    async conversationsByIds(userId, ids) {
      return ids.flatMap(id => {
        const c = conversations.get(id)
        return c && c.user_id === userId ? [{ id: c.id, title: c.title, summary: c.summary, updated_at: c.updated_at }] : []
      })
    },
    async deleteAll(userId) {
      let deleted = 0
      for (const [id, c] of [...conversations.entries()]) {
        if (c.user_id === userId) { conversations.delete(id); deleted += 1 }
      }
      return { ok: true, deleted }
    },
  }
}

test('COS conversation history remains scoped to the authenticated customer', async () => {
  const previous = getConversationHistoryStore()
  setConversationHistoryStore(memoryStore())
  try {
    await persistTurn({
      conversationId: CONVERSATION_A,
      userId: USER_A,
      userMessage: 'My preferred report format is concise tables.',
      assistantReply: 'Understood.',
    })

    const own = await searchPastConversations(USER_A, 'preferred report format', null)
    const other = await searchPastConversations(USER_B, 'preferred report format', null)

    assert.equal(own.ok, true)
    assert.equal(own.results.length, 1)
    assert.match(own.results[0]?.snippets.join(' ') || '', /preferred report format/i)
    assert.equal(other.ok, true)
    assert.equal(other.results.length, 0)
  } finally {
    setConversationHistoryStore(previous)
  }
})
