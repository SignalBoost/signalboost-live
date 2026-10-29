import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/assistant/chats/route.ts', import.meta.url), 'utf8')

test('History returns only owner and conversation scoped Builder child executions', () => {
  assert.match(route, /\.from\('builder_jobs'\)[\s\S]*?\.select\('id,conversation_id,history_message_id,status,created_at,updated_at'\)[\s\S]*?\.eq\('user_id', userId\)[\s\S]*?\.eq\('conversation_id', id\)/)
  assert.match(route, /builderExecutions: builderExecutions \?\? \[\]/)
  assert.doesNotMatch(route, /builderExecutions.*result: 'succeeded'/)
})

test('History fails closed if the child execution read is unavailable', () => {
  assert.match(route, /if \(builderReadError\)[\s\S]*?status: 500/)
  assert.match(route, /assistant_history_builder_link_read_failed/)
})
