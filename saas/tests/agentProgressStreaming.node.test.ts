import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { conciergeBuilderRequest } from '../lib/ai/cos/agentProgressClient.ts'

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

test('actual Concierge source attachments decode into the durable Builder request shape', () => {
  const dataUrl = (value: string) => `data:text/plain;base64,${Buffer.from(value).toString('base64')}`
  const request = conciergeBuilderRequest({
    messages: [{ role: 'user', content: 'Fix the attached source and test.' }],
    attachments: [
      { name: 'src/math.ts', type: 'text/typescript', dataUrl: dataUrl('export const add = (a:number,b:number) => a-b') },
      { name: 'src/math.test.ts', type: 'text/typescript', dataUrl: dataUrl("import { add } from './math.ts'") },
    ],
    context: { conversationId: '12345678-1234-1234-1234-123456789abc' },
  })
  assert.ok(request)
  assert.equal(request.endpoint, '/api/builder')
  assert.deepEqual(request.body, {
    objective: 'Fix the attached source and test.',
    conversationId: '12345678-1234-1234-1234-123456789abc',
    files: [
      { path: 'src/math.ts', content: 'export const add = (a:number,b:number) => a-b' },
      { path: 'src/math.test.ts', content: "import { add } from './math.ts'" },
    ],
  })
})

test('read-only source questions keep their existing ordinary Concierge route', () => {
  const dataUrl = `data:text/plain;base64,${Buffer.from('export const answer = 42').toString('base64')}`
  for (const content of ['Explain this source file.', 'Summarize the attached code.', 'Describe what this file does.']) {
    const request = conciergeBuilderRequest({
      messages: [{ role: 'user', content }],
      attachments: [{ name: 'answer.ts', type: 'text/typescript', dataUrl }],
      context: { conversationId: '12345678-1234-1234-1234-123456789abc' },
    })
    assert.equal(request, null, content)
  }
})

test('real homepage and dock upload handlers admit the Builder source extensions before transport', () => {
  const homepage = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  const dock = readFileSync(new URL('../components/Concierge.tsx', import.meta.url), 'utf8')
  for (const source of [homepage, dock]) {
    assert.match(source, /const BUILDER_SOURCE_FILE_RE = \/\\\.\(\?:c\?js\|mjs\|cts\|mts\|ts\|py\)\$\/i/)
    assert.match(source, /\.js,\.mjs,\.cjs,\.ts,\.mts,\.cts,\.py/)
    assert.match(source, /BUILDER_SOURCE_FILE_RE\.test\(file\.name\)/)
    assert.match(source, /accept=\{ATTACH_INPUT_ACCEPT\}/)
  }
})

test('non-code Concierge attachments stay on ordinary Concierge transport', () => {
  const pdf = conciergeBuilderRequest({
    messages: [{ role: 'user', content: 'Explain this PDF.' }],
    attachments: [{ name: 'report.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERg==' }],
    context: { conversationId: '12345678-1234-1234-1234-123456789abc' },
  })
  const image = conciergeBuilderRequest({
    messages: [{ role: 'user', content: 'Describe this image.' }],
    attachments: [{ name: 'photo.png', type: 'image/png', dataUrl: 'data:image/png;base64,aGVsbG8=' }],
    context: { conversationId: '12345678-1234-1234-1234-123456789abc' },
  })
  assert.equal(pdf, null)
  assert.equal(image, null)
})

test('progress client selects durable Builder only after shared Builder-intent classification', () => {
  const client = readFileSync(new URL('../lib/ai/cos/agentProgressClient.ts', import.meta.url), 'utf8')
  assert.match(client, /isConciergeBuilderObjective\(objective, \{ attachmentNames, attachmentMimeTypes \}\)/)
  assert.match(client, /args\.target === 'concierge' \? conciergeBuilderRequest\(args\.body\) : null/)
  assert.match(client, /const endpoint = builderRequest\?\.endpoint \?\? \(args\.target === 'cos' \? '\/api\/cos-primary' : '\/api\/concierge'\)/)
  assert.match(client, /credentials: 'include'/)
})
