import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { findRecoveredAssistantReply } from '../lib/ai/cos/assistantTransportRecovery.ts'

const route = readFileSync(new URL('../app/api/assistant/chats/route.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260831172000_builder_jobs_and_history_order.sql', import.meta.url), 'utf8')
const boundary = readFileSync(new URL('../components/AssistantTransportBoundary.tsx', import.meta.url), 'utf8')

test('History validates the conversation, reports database failures, and disables caching', () => {
  assert.match(route, /if \(!UUID\.test\(id\)\).*status: 400/)
  assert.match(route, /conversationError/)
  assert.match(route, /assistant_history_conversation_read_failed/)
  assert.match(route, /messagesError/)
  assert.match(route, /assistant_history_message_read_failed/)
  assert.match(route, /Cache-Control', 'no-store, max-age=0'/)
  assert.match(route, /conversation: null, messages: \[\], missing: true/)
})

test('History uses a durable sequence instead of timestamps to order paired messages', () => {
  assert.match(migration, /assistant_messages_message_order_seq/)
  assert.match(migration, /add column if not exists message_order bigint/)
  assert.match(migration, /alter column message_order set default nextval/)
  assert.match(migration, /row_number\(\) over/)
  assert.match(migration, /case role when 'user' then 0 when 'assistant' then 1 else 2 end/)
  assert.match(migration, /existing_max\.value \+ ordered_missing\.ordinal/)
  assert.match(migration, /assistant_messages_conversation_order_idx/)
  assert.match(migration, /revoke all on sequence public\.assistant_messages_message_order_seq from public, anon, authenticated/)
  assert.match(migration, /grant usage, select on sequence public\.assistant_messages_message_order_seq to service_role/)
  assert.match(route, /select\('id, role, content, created_at, message_order, provenance'\)/)
  assert.match(route, /\.order\('message_order', \{ ascending: true \}\)/)
})

test('recovery succeeds even when user and assistant share the same timestamp', () => {
  const timestamp = new Date().toISOString()
  const sentAt = Date.parse(timestamp)
  const recovered = findRecoveredAssistantReply([
    { role: 'user', content: 'Debug the attached file in Builder.', created_at: timestamp },
    { role: 'assistant', content: 'COS Builder is running job 123.', created_at: timestamp },
  ], 'Debug the attached file in Builder.', sentAt)
  assert.equal(recovered, 'COS Builder is running job 123.')
})

test('only Builder receives the 20–30 second History polling window', () => {
  assert.match(boundary, /BUILDER_HISTORY_POLL_ATTEMPTS = 11/)
  assert.match(boundary, /BUILDER_HISTORY_POLL_DELAY_MS = 2_500/)
  assert.match(boundary, /historyPollAttempts: 4/)
  assert.match(boundary, /historyPollDelayMs: 1_200/)
})
