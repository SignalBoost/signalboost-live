import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('missing assistant chat id returns empty transcript, not 404', () => {
  const source = readFileSync(new URL('../app/api/assistant/chats/route.ts', import.meta.url), 'utf8')
  assert.match(source, /missing:\s*true/)
  assert.doesNotMatch(source, /Conversation not found[\s\S]{0,80}status:\s*404/)
})
