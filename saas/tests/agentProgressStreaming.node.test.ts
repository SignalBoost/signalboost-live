import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Concierge and owner COS consume observable request progress instead of timer-only stages', () => {
  const concierge = readFileSync(new URL('../components/Concierge.tsx', import.meta.url), 'utf8')
  const assistant = readFileSync(new URL('../app/dashboard/assistant/page.tsx', import.meta.url), 'utf8')
  const activity = readFileSync(new URL('../components/AgentActivity.tsx', import.meta.url), 'utf8')
  assert.match(concierge, /postWithAgentProgress\(\{ target: 'concierge'/)
  assert.match(assistant, /target: 'cos'/)
  assert.match(concierge, /activity=\{activity\}/)
  assert.match(assistant, /activity=\{activity\}/)
  assert.match(activity, /activity\?\.sequence/)
})

test('progress transport follows the durable Builder job to its terminal result', () => {
  const client = readFileSync(new URL('../lib/ai/cos/agentProgressClient.ts', import.meta.url), 'utf8')
  assert.match(client, /\/api\/cos-primary/)
  assert.match(client, /\/api\/concierge/)
  assert.match(client, /\/api\/builder\?jobId=/)
  assert.match(client, /poll\.status === 202/)
  assert.match(client, /COS Builder completed the job/)
  assert.doesNotMatch(client, /\/api\/agent-progress/)
})
