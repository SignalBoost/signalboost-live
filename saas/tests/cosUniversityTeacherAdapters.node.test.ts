import test from 'node:test'
import assert from 'node:assert/strict'
import { generateWithUniversityTeacher } from '../lib/ai/cos/cosUniversityTeacherAdapters.ts'
import { UNIVERSITY_TEACHERS, universityTeacherDefinitions } from '../lib/ai/cos/cosUniversityTeacherPool.ts'

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


test('DeepSeek API teacher uses the OpenAI-compatible chat contract', async () => {
  let seenUrl = ''
  let seenHeaders: HeadersInit | undefined
  let body: any = null
  const result = await generateWithUniversityTeacher({
    teacher: byId('deepseek-api'),
    env: {
      DEEPSEEK_API_KEY: 'dsk_123456789012345678901234567890',
      COS_UNIVERSITY_TEACHER_DEEPSEEK_API_MODEL: 'deepseek-flash',
    },
    request: { system: 'Teach carefully.', prompt: 'Explain D.', maxOutputTokens: 384 },
    fetchImpl: async (input, init) => {
      seenUrl = String(input)
      seenHeaders = init?.headers
      body = JSON.parse(String(init?.body || '{}'))
      return new Response(JSON.stringify({
        id: 'deepseek-1',
        choices: [{ message: { content: 'deepseek answer' } }],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      }), { status: 200, headers: { 'x-request-id': 'req-d' } })
    },
  })
  assert.equal(seenUrl, 'https://api.deepseek.com/chat/completions')
  assert.match(JSON.stringify(seenHeaders), /Bearer dsk_123456789012345678901234567890/)
  assert.equal(body.model, 'deepseek-chat')
  assert.equal(result.model, 'deepseek-chat')
  assert.equal(body.max_tokens, 384)
  assert.equal(result.text, 'deepseek answer')
  assert.equal(result.provider, 'deepseek')
})

test('Gemini teacher uses native GenerateContent with bounded low thinking', async () => {
  let seenUrl = ''
  let seenHeaders: HeadersInit | undefined
  let body: any = null
  const result = await generateWithUniversityTeacher({
    teacher: byId('gemini'),
    env: {
      GEMINI_API_KEY: 'gai_123456789012345678901234567890',
      COS_UNIVERSITY_TEACHER_GEMINI_MODEL: 'gemini-3.8-flash',
    },
    request: { system: 'Teach carefully.', prompt: 'Explain G.', maxOutputTokens: 384, temperature: 0.2 },
    fetchImpl: async (input, init) => {
      seenUrl = String(input)
      seenHeaders = init?.headers
      body = JSON.parse(String(init?.body || '{}'))
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [
          { thought: true, text: 'internal summary' },
          { text: 'gemini answer' },
        ] } }],
        usageMetadata: { promptTokenCount: 16, candidatesTokenCount: 9 },
      }), { status: 200, headers: { 'x-goog-request-id': 'req-gemini' } })
    },
  })
  assert.equal(seenUrl, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
  assert.match(JSON.stringify(seenHeaders), /x-goog-api-key/)
  assert.equal(body.systemInstruction.parts[0].text, 'Teach carefully.')
  assert.equal(body.contents[0].parts[0].text, 'Explain G.')
  assert.equal(body.generationConfig.maxOutputTokens, 384)
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low')
  assert.equal(body.generationConfig.temperature, undefined)
  assert.equal(result.text, 'gemini answer')
  assert.equal(result.inputTokens, 16)
  assert.equal(result.outputTokens, 9)
  assert.equal(result.requestId, 'req-gemini')
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


test('a buyer-added OpenAI-compatible provider uses the same transport adapter without vendor-specific code', async () => {
  const env = {
    BUYER_CLOUD_KEY: 'buyer_123456789012345678901234567890',
    BUYER_CLOUD_ENABLED: 'true',
    BUYER_CLOUD_READY: 'true',
    BUYER_CLOUD_MODEL: 'buyer-model-v2',
    BUYER_CLOUD_ENDPOINT: 'https://models.example.test/v1/chat/completions',
    COS_UNIVERSITY_TEACHER_PROVIDERS_JSON: JSON.stringify([{
      id: 'buyer-cloud',
      provider: 'buyer-cloud',
      transport: 'openai_compatible',
      credentialEnv: 'BUYER_CLOUD_KEY',
      enabledEnv: 'BUYER_CLOUD_ENABLED',
      adapterReadyEnv: 'BUYER_CLOUD_READY',
      modelEnv: 'BUYER_CLOUD_MODEL',
      endpointEnv: 'BUYER_CLOUD_ENDPOINT',
    }]),
  }
  const teacher = universityTeacherDefinitions(env).find(item => item.id === 'buyer-cloud')!
  let seenUrl = ''
  let seenModel = ''
  const result = await generateWithUniversityTeacher({
    teacher,
    env,
    request: { system: 'Teach.', prompt: 'Explain.', maxOutputTokens: 128 },
    fetchImpl: async (input, init) => {
      seenUrl = String(input)
      seenModel = JSON.parse(String(init?.body || '{}')).model
      return new Response(JSON.stringify({
        id: 'buyer-request-1',
        choices: [{ message: { content: 'buyer provider answer' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }), { status: 200, headers: { 'x-request-id': 'buyer-request-1' } })
    },
  })
  assert.equal(seenUrl, 'https://models.example.test/v1/chat/completions')
  assert.equal(seenModel, 'buyer-model-v2')
  assert.equal(result.provider, 'buyer-cloud')
  assert.equal(result.text, 'buyer provider answer')
})
