// saas/tests/builderAssistanceModeTransport.node.test.ts
//
// Production 2026-10-22: the owner chose 🤝 Work with me on itmounts.com and sent the Calculator API acceptance spec;
// Builder published without asking. Chat sends a build spec straight to /api/builder, and that request dropped the
// mode; /api/builder never read it. A plain "go" also never reached the approval: chat only consults Builder for
// software requests, and the public Concierge lane does not carry the signed-in identity. The spec now carries the
// mode to /api/builder, and the chat endpoint answers a Work with me "go" as the signed-in user before public scoping.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { conciergeBuilderRequest, postWithAgentProgress } from '../lib/ai/cos/agentProgressClient.ts'

const source = readFileSync(new URL('./builderTitledSpecificationRouting.node.test.ts', import.meta.url), 'utf8')
const spec: string = JSON.parse(source.slice(source.indexOf('const spec = ') + 'const spec = '.length, source.indexOf('\nconst conversationId')))
const conversationId = '44444444-4444-4444-8444-444444444444'
const chat = (content: string, assistanceMode?: string) => ({
  messages: [{ role: 'user', content }], attachments: [],
  context: { language: 'es', currentPage: '/', conversationId, ...(assistanceMode ? { assistanceMode } : {}) },
})

test('the acceptance spec carries the chosen mode to Builder; Guide me never starts Builder', () => {
  assert.equal(conciergeBuilderRequest(chat(spec, 'collaborate'))?.body.assistanceMode, 'collaborate')
  assert.equal(conciergeBuilderRequest(chat(spec, 'collaborate'))?.body.language, 'es')
  assert.equal(conciergeBuilderRequest(chat(spec, 'autonomous'))?.body.assistanceMode, 'autonomous')
  assert.equal(conciergeBuilderRequest(chat(spec, 'guide')), null)
  assert.ok(conciergeBuilderRequest(chat(spec))?.body, 'clients that send no mode keep working (server uses the saved one)')
})

// The browser: a simulated clock, and a server that records every request.
function browser() {
  let now = Date.parse('2026-10-22T11:40:00Z')
  const realNow = Date.now
  Date.now = () => now
  const original = { window: (globalThis as any).window, fetch: globalThis.fetch }
  ;(globalThis as any).window = { setTimeout: (fn: () => void, ms: number) => { now += ms; return setTimeout(fn, 0) },
    clearTimeout: (id: any) => clearTimeout(id), setInterval: () => 0, clearInterval: () => undefined }
  const posts: Array<{ url: string; body: any }> = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST') posts.push({ url, body: JSON.parse(String(init.body)) })
    if (url.startsWith('/api/assistant/chats')) return Response.json({}, { status: 404 })
    if (url.startsWith('/api/builder?jobId=job-2')) return Response.json({ jobId: 'job-2', status: 'succeeded', reply: 'Final result: PASS' })
    if (url === '/api/cos-browser') return Response.json({ jobId: 'job-2', status: 'queued', reply: 'Aprobado.', source: 'cos-builder-approved-publication' }, { status: 202 })
    return Response.json({}, { status: 404 })
  }) as typeof fetch
  return { posts, restore: () => { Date.now = realNow; (globalThis as any).window = original.window; globalThis.fetch = original.fetch } }
}

test('"adelante" is one chat request; when the server starts the publish job, chat follows it to its report', async () => {
  const b = browser()
  try {
    const result = await postWithAgentProgress({ target: 'concierge', body: chat('adelante', 'collaborate'), signal: new AbortController().signal, onProgress: () => undefined })
    assert.equal(result.data.reply, 'Final result: PASS')
    assert.deepEqual(b.posts.map(post => post.url), ['/api/cos-browser'], 'one POST per message, never a second one')
    assert.equal(b.posts[0].body.context.assistanceMode, 'collaborate')
  } finally { b.restore() }
})

test('the chat endpoint answers a Work with me approval as the signed-in user, before any public scoping', () => {
  const route = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const turn = route.slice(route.indexOf('async function executeBrowserTurn('))
  const approval = turn.indexOf("if (body?.context?.assistanceMode === 'collaborate' && isAssistanceApproval(prompt))")
  assert.ok(approval > 0 && approval < turn.indexOf('withPublicDeliveryScope('), 'before public scoping')
  assert.ok(approval < turn.indexOf('const directTextTransformation'), 'before any other lane can claim "go"')
  assert.match(turn, /await approvePausedPublication\(\{ userId: approver\.userId, conversationId: approvalConversationId, language \}\)/)
  assert.match(turn, /return browserSurface === 'concierge' \? publicConciergePresentation\(response\) : response\n\s*\}\n\s*\}/)
})

test('/api/builder applies the mode to every job it starts', () => {
  const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  const post = route.slice(route.indexOf('export async function POST'), route.indexOf('export async function DELETE'))
  assert.match(post, /const assistanceMode = await resolveAssistanceMode\(body\?\.assistanceMode, access\.userId\)/)
  assert.match(post, /\.\.\.\(assistanceMode === 'collaborate' \? \{ assistanceMode \} : \{\}\)/)
  assert.equal((post.match(/\.\.\.modeMetadata,/g) || []).length, 4, 'both V2 enqueues and both repair enqueues')
})
