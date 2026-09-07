import assert from 'node:assert/strict'
import test from 'node:test'
import { withPublicDeliveryScope } from '../lib/auth/publicDeliveryScope.ts'
import {
  loadUserMemories,
  setUserMemoryStore,
  type UserMemoryStore,
} from '../lib/ai/tools/userMemoryStore.ts'
import {
  setConversationHistoryStore,
  type ConversationHistoryStore,
} from '../lib/ai/tools/conversationHistory.ts'

const memoryStore: UserMemoryStore = {
  async list(userId) {
    return userId === 'user-a'
      ? [{ id: 'm1', kind: 'preference', content: 'Prefers concise answers', created_at: '2026-09-01T00:00:00Z' }]
      : []
  },
  async findDuplicate() { return false },
  async listAllOrdered() { return [] },
  async deleteIds() {},
  async insert() { return { ok: true } },
  async deleteMatching() { return { ok: true, deleted: 0 } },
}

const historyReads: string[] = []
const historyStore: ConversationHistoryStore = {
  async getConversation() { return null },
  async createConversation() { return { ok: true } },
  async insertMessages() { return { ok: true } },
  async bumpConversation() {},
  async recentMessages() { return [] },
  async setSummary() {},
  async recentConversations(userId) {
    historyReads.push(userId)
    return userId === 'user-a'
      ? [{
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Website launch discussion',
          summary: 'The customer wants the launch page to emphasize speed and multilingual support.',
          updated_at: '2026-09-06T14:00:00Z',
        }]
      : []
  },
  async searchMessages() { return [] },
  async conversationsByIds() { return [] },
  async deleteAll() { return { ok: true, deleted: 0 } },
}

setUserMemoryStore(memoryStore)
setConversationHistoryStore(historyStore)

test('public COS combines saved user facts with that same customer recent conversation continuity', async () => {
  historyReads.length = 0
  const memories = await withPublicDeliveryScope(() => loadUserMemories('user-a'))

  assert.equal(memories.some(memory => memory.kind === 'preference' && memory.content.includes('concise')), true)
  assert.equal(memories.some(memory => memory.kind === 'conversation' && memory.content.includes('Website launch discussion')), true)
  assert.deepEqual(historyReads, ['user-a'])
})

test('public COS conversation continuity remains user-scoped', async () => {
  historyReads.length = 0
  const memories = await withPublicDeliveryScope(() => loadUserMemories('user-b'))

  assert.equal(memories.some(memory => memory.content.includes('Website launch discussion')), false)
  assert.deepEqual(historyReads, ['user-b'])
})

test('non-public COS memory behavior is unchanged and does not auto-read conversation history', async () => {
  historyReads.length = 0
  const memories = await loadUserMemories('user-a')

  assert.equal(memories.length, 1)
  assert.equal(memories[0]?.kind, 'preference')
  assert.deepEqual(historyReads, [])
})
