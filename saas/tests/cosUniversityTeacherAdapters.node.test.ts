import test from 'node:test'
import assert from 'node:assert/strict'
import { generateWithUniversityTeacher } from '../lib/ai/cos/cosUniversityTeacherAdapters.ts'
import { UNIVERSITY_TEACHERS } from '../lib/ai/cos/cosUniversityTeacherPool.ts'

const byId = (id: string) => UNIVERSITY_TEACHERS.find(item => item.id === id)!

test('OpenAI-compatible adapter uses buyer-configured model and never falls back', async () => {
  let seenUrl = ''
  let seenBody: any = null
  const result = await generateWithUniversityTeacher({
    teacher: byId('openai'),
    env: {
      OPENAI_API_KEY: 'sk_123456789012345678901234567890',
      COS_UNIVERSITY_TEACHER_OPENAI_MODEL: 'buyer-approved-openai-model',
    },
    request: { system: 'Teach carefully.', prompt: 'Explain X.', maxOutputTokens: 300 },
    fetchImpl: async (input, init) => {
      seenUrl = String(input)
      seenBody = JSON.parse(String(init?.body || '{}'))
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'answer' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }), { status: 200, headers: { 'x-request-id': 'req-1' } })
    },
  })
  assert.equal(seenUrl, 'https://api.openai.com/v1/chat/completions')
  assert.equal(seenBody.model, 'buyer-approved-openai-model')
  assert.equal(result.text, 'answer')
  assert.equal(result.requestId, 'req-1')
})

test('Anthropic adapter uses Messages contract and buyer-selected model', async () => {
  let headers: HeadersInit | undefined
  let body: any = null
  const result = await generateWithUniversityTeacher({
    teacher: byId('claude'),
    env: {
      ANTHROPIC_API_KEY: 'sk-ant-123456789012345678901234567890',
      COS_UNIVERSITY_TEACHER_ANTHROPIC_MODEL: 'buyer-approved-claude-model',
    },
    request: { system: 'Teach carefully.', prompt: 'Explain Y.', maxOutputTokens: 300 },
    fetchImpl: async (_input, init) => {
      headers = init?.headers
      body = JSON.parse(String(init?.body || '{}'))
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: 'anthropic answer' }],
        usage: { input_tokens: 12, output_tokens: 6 },
      }), { status: 200, headers: { 'request-id': 'req-a' } })
    },
  })
  assert.equal(body.model, 'buyer-approved-claude-model')
  assert.match(JSON.stringify(headers), /anthropic-version/)
  assert.equal(result.text, 'anthropic answer')
})

test('local/Hugging Face teachers must use the governed local executor, not hosted adapter fallback', async () => {
  await assert.rejects(
    generateWithUniversityTeacher({
      teacher: byId('qwen'),
      env: {},
      request: { system: 'x', prompt: 'y', maxOutputTokens: 64 },
      fetchImpl: async () => new Response('{}'),
    }),
    /university_teacher_transport_requires_local_executor/,
  )
})

test('xAI/Grok adapter uses the OpenAI-compatible contract with exact buyer model and idempotency key', async () => {
  let seenUrl = ''
  let seenHeaders: any = null
  let seenBody: any = null
  const result = await generateWithUniversityTeacher({
    teacher: byId('grok'),
    env: {
      XAI_API_KEY: 'xai_123456789012345678901234567890',
      COS_UNIVERSITY_TEACHER_XAI_MODEL: 'buyer-approved-grok-model',
    },
    request: { system: 'Teach carefully.', prompt: 'Explain Z.', maxOutputTokens: 300, requestKey: 'a'.repeat(64) },
    fetchImpl: async (input, init) => {
      seenUrl = String(input)
      seenHeaders = init?.headers
      seenBody = JSON.parse(String(init?.body || '{}'))
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'grok answer' } }],
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      }), { status: 200, headers: { 'x-request-id': 'req-x' } })
    },
  })
  assert.equal(seenUrl, 'https://api.x.ai/v1/chat/completions')
  assert.equal(seenBody.model, 'buyer-approved-grok-model')
  assert.match(JSON.stringify(seenHeaders), /Idempotency-Key/)
  assert.equal(result.provider, 'xai')
  assert.equal(result.requestId, 'req-x')
})

test('hosted teacher refuses placeholder or missing model configuration', async () => {
  await assert.rejects(
    generateWithUniversityTeacher({
      teacher: byId('openai'),
      env: { OPENAI_API_KEY: 'sk_123456789012345678901234567890' },
      request: { system: 'x', prompt: 'y', maxOutputTokens: 64 },
      fetchImpl: async () => new Response('{}'),
    }),
    /university_teacher_not_configured/,
  )
})
