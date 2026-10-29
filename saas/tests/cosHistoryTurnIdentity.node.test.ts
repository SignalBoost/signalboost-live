import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const route=readFileSync(new URL('../app/api/assistant/chats/route.ts',import.meta.url),'utf8')
test('History scopes COS turn identity to authenticated conversation and keeps Builder separate',()=>{
  assert.match(route,/\.eq\('user_id', userId\)/)
  assert.match(route,/\.eq\('conversation_id', id\)/)
  assert.match(route,/recorded\.schema !== 'signalboost-cos-turn-v1'/)
  assert.match(route,/UUID\.test\(recorded\.turnId\)/)
  assert.match(route,/historyMessageId: message\.id/)
  assert.match(route,/cosTurns, builderExecutions: builderExecutions/)
  assert.doesNotMatch(route,/builderExecutions\.map\([^]*turnId/)
})
