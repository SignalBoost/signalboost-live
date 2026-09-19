import test from 'node:test'
import assert from 'node:assert/strict'
import { generateWithUniversityTeacher } from '../lib/ai/cos/cosUniversityTeacherAdapters.ts'
import { UNIVERSITY_TEACHERS } from '../lib/ai/cos/cosUniversityTeacherPool.ts'

const byId = (id: string) => UNIVERSITY_TEACHERS.find(item => item.id === id)!

test('OpenAI GPT-5.6 teacher uses the Responses API and never falls back', async () => {
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
        id: 'resp-1',
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'answer' }],
        }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }), { status: 200, headers: { 'x-request-id': 'req-1' } })
    },
  })
  assert.equal(seenUrl, 'https://api.openai.com/v1/responses')
  assert.equal(seenBody.model, 'buyer-approved-openai-model')
  assert.deepEqual(seenBody.reasoning, { effort: 'none' })
  assert.equal(seenBody.max_output_tokens, 300)
  assert.equal(seenBody.input[0].content[0].type, 'input_text')
  assert.equal(seenBody.input[1].content[0].type, 'input_text')
  assert.equal(seenBody.max_tokens, undefined)
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


test('xAI adapter uses Grok-compatible low-reasoning Chat Completions payload', async () => {
  let body: any = null
  const result = await generateWithUniversityTeacher({
    teacher: byId('grok'),
    env: {
      XAI_API_KEY: 'xai_123456789012345678901234567890',
      COS_UNIVERSITY_TEACHER_XAI_MODEL: 'grok-4.6',
    },
    request: { system: 'Teach carefully.', prompt: 'Explain Z.', maxOutputTokens: 384 },
    fetchImpl: async (_input, init) => {
      body = JSON.parse(String(init?.body || '{}'))
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'grok answer' } }],
        usage: { prompt_tokens: 14, completion_tokens: 7 },
      }), { status: 200, headers: { 'x-request-id': 'req-g' } })
    },
  })
  assert.equal(body.model, 'grok-4.6')
  assert.equal(body.reasoning_effort, 'low')
  assert.equal(body.max_tokens, 384)
  assert.equal(result.text, 'grok answer')
})


test('provider HTTP failures expose status and safe provider error code without response body', async () => {
  await assert.rejects(
    generateWithUniversityTeacher({
      teacher: byId('claude'),
      env: {
        ANTHROPIC_API_KEY: 'sk-ant-123456789012345678901234567890',
        COS_UNIVERSITY_TEACHER_ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      },
      request: { system: 'x', prompt: 'y', maxOutputTokens: 128 },
      fetchImpl: async () => new Response(JSON.stringify({
        type: 'error',
        error: { type: 'permission_error', message: 'sensitive provider detail' },
      }), { status: 403 }),
    }),
    /university_teacher_http_403:permission_error/,
  )
})
