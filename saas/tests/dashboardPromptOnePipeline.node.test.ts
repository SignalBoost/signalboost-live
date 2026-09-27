// saas/tests/dashboardPromptOnePipeline.node.test.ts
// One pipeline, Stage 3 (2026-09-27): the dashboard prompt uses the canonical browser ingress.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../app/dashboard/page.tsx', import.meta.url), 'utf8')

test('dashboard prompt posts to /api/cos-browser on the Concierge surface, never /api/support', () => {
  assert.doesNotMatch(page, /fetch\(\s*['"`]\/api\/support/)
  const send = page.slice(page.indexOf('async function sendPrompt'), page.indexOf('async function handleDelete'))
  assert.match(send, /fetch\('\/api\/cos-browser'/)
  assert.match(send, /'x-signalboost-surface': 'concierge'/)
  assert.match(send, /credentials: 'include'/)
  assert.match(send, /conversationId: promptConversationIdRef\.current/)
  assert.match(send, /language: lang/)
})

test('the privileged COS surface is not reachable from the dashboard prompt', () => {
  const send = page.slice(page.indexOf('async function sendPrompt'), page.indexOf('async function handleDelete'))
  assert.doesNotMatch(send, /'x-signalboost-surface': 'cos'/)
})
