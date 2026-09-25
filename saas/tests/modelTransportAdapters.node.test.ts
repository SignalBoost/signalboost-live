import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBuyerModelProfiles } from '../lib/ai/modelCapabilityRegistry.ts'
import { requireTransportForProfile } from '../lib/ai/modelTransportAdapter.ts'
import { createBuiltinModelTransportAdapters } from '../lib/ai/modelTransportAdapters.ts'
import { parseModelTransportBindings } from '../lib/ai/modelTransportConfig.ts'

function profile(input: {
  key: string
  modelId: string
  protocol: 'openai_compatible' | 'anthropic_messages' | 'google_generate_content' | 'custom_http'
  inference?: Record<string, string>
}) {
  return parseBuyerModelProfiles(JSON.stringify([{
    key: input.key,
    family: 'buyer',
    modelId: input.modelId,
    providerModelId: input.modelId,
    revisionPolicy: 'runtime_owned',
    uses: ['cos_reasoner', 'builder', 'specialist'],
    transportProtocols: [input.protocol],
    inference: { chatCompletion: 'validated', ...(input.inference || {}) },
    training: {},
  }]))[0]
}

test('buyer transport bindings keep endpoints and credential names separate from model profiles', () => {
  const [binding] = parseModelTransportBindings(JSON.stringify([{
    profileKey: 'buyer-claude-v1',
    protocol: 'anthropic_messages',
    provider: 'anthropic',
    credentialEnv: 'BUYER_ANTHROPIC_KEY',
    timeoutMs: 90000,
  }]))
  assert.equal(binding.profileKey, 'buyer-claude-v1')
  assert.equal(binding.endpoint, null)
  assert.equal(binding.credentialEnv, 'BUYER_ANTHROPIC_KEY')
  assert.equal(binding.timeoutMs, 90000)
  assert.throws(() => parseModelTransportBindings(JSON.stringify([{
    profileKey: 'buyer-openai-v1',
    protocol: 'openai_compatible',
    provider: 'buyer',
  }])), /platform_model_transport_endpoint_required/)
  assert.throws(() => parseModelTransportBindings(JSON.stringify([{
    profileKey: 'buyer-bad-v1',
    protocol: 'openai_compatible',
    provider: 'buyer',
    endpoint: 'http:\/\/insecure.example.test\/v1\/chat\/completions',
  }])), /platform_model_transport_endpoint_invalid/)
})

test('OpenAI-compatible adapter translates canonical tools without making OpenAI the platform contract', async () => {
  const p = profile({
    key: 'buyer-openai-wire-v1',
    modelId: 'buyer/model-a',
    protocol: 'openai_compatible',
    inference: { toolCalling: 'validated', structuredJson: 'validated' },
  })
  const [binding] = parseModelTransportBindings(JSON.stringify([{
    profileKey: p.key,
    protocol: 'openai_compatible',
    provider: 'buyer-provider',
    endpoint: 'https:\/\/models.example.test\/v1\/chat\/completions',
    credentialEnv: 'BUYER_MODEL_KEY',
  }]))
  let seenBody: any = null
  const adapters = createBuiltinModelTransportAdapters({
    profiles: [p],
    bindings: [binding],
    env: { BUYER_MODEL_KEY: 'secret' },
    fetchImpl: async (_url, init) => {
      seenBody = JSON.parse(String(init?.body || '{}'))
      return new Response(JSON.stringify({
        id: 'req-openai-shape',
        choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{
          id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{"q":"x"}' },
        }] } }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }), { status: 200, headers: { 'x-request-id': 'req-1' } })
    },
  })
  const adapter = requireTransportForProfile(p, adapters)
  const result = await adapter.chat({
    profile: p,
    messages: [{ role: 'user', content: 'Find x' }],
    tools: [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } }],
    toolChoice: 'auto',
    maxOutputTokens: 256,
  })
  assert.equal(seenBody.model, 'buyer/model-a')
  assert.equal(seenBody.tools[0].function.name, 'lookup')
  assert.equal(result.toolCalls[0].name, 'lookup')
  assert.equal(result.inputTokens, 10)
})

test('Anthropic adapter uses Messages tools and requires a real structured-output schema', async () => {
  const p = profile({
    key: 'buyer-anthropic-v1',
    modelId: 'buyer/claude-model',
    protocol: 'anthropic_messages',
    inference: { toolCalling: 'validated', structuredJson: 'validated' },
  })
  const [binding] = parseModelTransportBindings(JSON.stringify([{
    profileKey: p.key,
    protocol: 'anthropic_messages',
    provider: 'anthropic',
    credentialEnv: 'BUYER_ANTHROPIC_KEY',
  }]))
  let body: any = null
  let headers: any = null
  const adapters = createBuiltinModelTransportAdapters({
    profiles: [p],
    bindings: [binding],
    env: { BUYER_ANTHROPIC_KEY: 'ant-secret' },
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body || '{}'))
      headers = init?.headers
      return new Response(JSON.stringify({
        id: 'msg-1',
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'toolu-1', name: 'lookup', input: { q: 'x' } }],
        usage: { input_tokens: 11, output_tokens: 5 },
      }), { status: 200, headers: { 'request-id': 'anth-req-1' } })
    },
  })
  const adapter = requireTransportForProfile(p, adapters)
  await assert.rejects(() => adapter.chat({
    profile: p,
    messages: [{ role: 'user', content: 'Return JSON' }],
    jsonObject: true,
  }), /platform_model_transport_json_schema_required/)
  const result = await adapter.chat({
    profile: p,
    messages: [{ role: 'system', content: 'Be precise.' }, { role: 'user', content: 'Find x' }],
    jsonObject: true,
    jsonSchema: {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
      additionalProperties: false,
    },
    tools: [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'], additionalProperties: false } }],
  })
  assert.equal((headers as Record<string, string>)['anthropic-version'], '2023-06-01')
  assert.equal(body.system, 'Be precise.')
  assert.equal(body.tools[0].input_schema.type, 'object')
  assert.equal(body.output_config.format.type, 'json_schema')
  assert.equal(result.toolCalls[0].id, 'toolu-1')
  assert.equal(result.requestId, 'anth-req-1')
})

test('Gemini adapter maps canonical function declarations and preserves function-call ids', async () => {
  const p = profile({
    key: 'buyer-gemini-v1',
    modelId: 'gemini-buyer-model',
    protocol: 'google_generate_content',
    inference: { toolCalling: 'validated', structuredJson: 'validated' },
  })
  const [binding] = parseModelTransportBindings(JSON.stringify([{
    profileKey: p.key,
    protocol: 'google_generate_content',
    provider: 'google',
    credentialEnv: 'BUYER_GEMINI_KEY',
  }]))
  let seenUrl = ''
  let body: any = null
  const adapters = createBuiltinModelTransportAdapters({
    profiles: [p],
    bindings: [binding],
    env: { BUYER_GEMINI_KEY: 'g-secret' },
    fetchImpl: async (url, init) => {
      seenUrl = String(url)
      body = JSON.parse(String(init?.body || '{}'))
      return new Response(JSON.stringify({
        responseId: 'gem-resp-1',
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ functionCall: { id: 'gcall-1', name: 'lookup', args: { q: 'x' } } }] },
        }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 6 },
      }), { status: 200, headers: { 'x-goog-request-id': 'google-req-1' } })
    },
  })
  const adapter = requireTransportForProfile(p, adapters)
  const result = await adapter.chat({
    profile: p,
    messages: [{ role: 'system', content: 'Be precise.' }, { role: 'user', content: 'Find x' }],
    jsonObject: true,
    jsonSchema: {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
    },
    tools: [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } }],
  })
  assert.match(seenUrl, /gemini-buyer-model:generateContent$/)
  assert.equal(body.systemInstruction.parts[0].text, 'Be precise.')
  assert.equal(body.tools[0].functionDeclarations[0].name, 'lookup')
  assert.equal(body.generationConfig.responseMimeType, 'application/json')
  assert.equal(result.toolCalls[0].id, 'gcall-1')
  assert.equal(result.outputTokens, 6)
})

test('custom/native/local protocols remain injectable rather than guessed by a builtin adapter', () => {
  const p = profile({
    key: 'buyer-custom-v1',
    modelId: 'buyer/custom',
    protocol: 'custom_http',
  })
  const [binding] = parseModelTransportBindings(JSON.stringify([{
    profileKey: p.key,
    protocol: 'custom_http',
    provider: 'buyer',
    endpoint: 'https:\/\/custom.example.test\/invoke',
  }]))
  const adapters = createBuiltinModelTransportAdapters({ profiles: [p], bindings: [binding], env: {} })
  assert.equal(adapters.length, 0)
  assert.throws(() => requireTransportForProfile(p, adapters), /platform_model_transport_unavailable/)
})
