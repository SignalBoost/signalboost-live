import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Concierge and owner COS consume observable request progress instead of timer-only stages', () => {
  const concierge = readFileSync(new URL('../components/Concierge.tsx', import.meta.url), 'utf8')
  const homepage = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  const assistant = readFileSync(new URL('../app/dashboard/assistant/page.tsx', import.meta.url), 'utf8')
  const activity = readFileSync(new URL('../components/AgentActivity.tsx', import.meta.url), 'utf8')
  assert.match(concierge, /postWithAgentProgress\(\{ target: 'concierge'/)
  assert.match(homepage, /postWithAgentProgress\(\{/)
  assert.match(homepage, /target: 'concierge'/)
  assert.match(homepage, /<AgentActivity lang=\{lang\} compact activity=\{activity\}/)
  assert.doesNotMatch(homepage, /loading \? <p className="thinking"/)
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

test('actual Concierge source attachments are decoded and posted to durable Builder instead of legacy directBuilder', () => {
  const client = readFileSync(new URL('../lib/ai/cos/agentProgressClient.ts', import.meta.url), 'utf8')
  assert.match(client, /const SOURCE_FILE = \/\\\.\(\?:c\?js\|mjs\|cts\|mts\|ts\|py\)\$\/i/)
  assert.match(client, /function conciergeBuilderRequest\(body: unknown\)/)
  assert.match(client, /decodeTextDataUrl\(dataUrl\)/)
  assert.match(client, /files\.push\(\{ path, content \}\)/)
  assert.match(client, /endpoint: '\/api\/builder'/)
  assert.match(client, /body: \{ objective, conversationId, files \}/)
  assert.match(client, /args\.target === 'concierge' \? conciergeBuilderRequest\(args\.body\) : null/)
  assert.match(client, /const endpoint = builderRequest\?\.endpoint \?\? \(args\.target === 'cos' \? '\/api\/cos-primary' : '\/api\/concierge'\)/)
  assert.match(client, /credentials: 'include'/)
})
