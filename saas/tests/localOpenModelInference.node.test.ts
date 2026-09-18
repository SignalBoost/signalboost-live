import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

import { callLocalModel, checkLocalInferenceHealth, localInferenceConfigFromEnv } from '../lib/ai/local-inference.ts'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

test.beforeEach(() => {
  // These cases validate the explicit localhost/appliance transport itself. Provider-selection policy
  // is covered separately in runpodPrimaryRouting.node.test.ts and must not add a second request here.
  process.env.RUNPOD_PRIMARY_ENABLED = 'false'
})

test.afterEach(() => {
  process.env = { ...originalEnv }
  globalThis.fetch = originalFetch
})

test('local inference configuration defaults to the internal ai-brain endpoint and requires a model', () => {
  delete process.env.LOCAL_AI_BASE_URL
  process.env.LOCAL_AI_MODEL = 'signalboost-local-brain'
  const config = localInferenceConfigFromEnv()
  assert.equal(config.baseUrl, 'http://ai-brain:8000/v1')
  assert.equal(config.model, 'signalboost-local-brain')
})

test('local inference rejects arbitrary external hosts', () => {
  process.env.LOCAL_AI_BASE_URL = 'https://example.com/v1'
  process.env.LOCAL_AI_MODEL = 'signalboost-local-brain'
  assert.throws(() => localInferenceConfigFromEnv(), /host is not allowed/)
})

test('local inference sends OpenAI-compatible chat completions with appliance authorization', async () => {
  let observedUrl = ''
  let observedAuthorization = ''
  let observedBody: Record<string, unknown> = {}
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    observedUrl = String(input)
    observedAuthorization = new Headers(init?.headers).get('Authorization') || ''
    observedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ choices: [{ message: { content: 'local answer' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  const result = await callLocalModel(
    { prompt: 'diagnose incident', maxTokens: 512 },
    { baseUrl: 'http://127.0.0.1:8000/v1', model: 'signalboost-local-brain', apiKey: 'device-secret', timeoutMs: 5000 },
  )

  assert.equal(result, 'local answer')
  assert.equal(observedUrl, 'http://127.0.0.1:8000/v1/chat/completions')
  assert.equal(observedAuthorization, 'Bearer device-secret')
  assert.equal(observedBody.model, 'signalboost-local-brain')
  assert.equal(observedBody.max_tokens, 512)
  assert.equal(observedBody.response_format, undefined)
})

test('Builder requests provider-enforced JSON for source with quotes, escapes and newlines', async () => {
  const content = 'const quote = "hello";\nconst pattern = /\\d+/;\nconsole.log(quote);'
  const control = { type: 'tool', toolId: 'write_file', input: { path: 'quote.js', content } }
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body))
    assert.deepEqual(body.response_format, { type: 'json_object' })
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(control) } }], usage: { completion_tokens: 95 } })
  }) as typeof fetch
  const result = await callLocalModel({ prompt: 'Return JSON.', jsonObject: true }, { baseUrl: 'http://localhost/v1', model: 'configured-builder', timeoutMs: 5000 })
  assert.deepEqual(JSON.parse(result!), control)
  const port = readFileSync(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')
  assert.match(port.slice(port.indexOf('export function createBuilderCodingAiPort'), port.indexOf('export function createLocalApplianceAiPort')), /jsonObject: true/)
})

test('provider-confirmed truncation gets one larger retry and never executes partial control', async () => {
  const observed: number[] = []
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body))
    observed.push(body.max_tokens)
    // Even parseable control is discarded if the provider says generation was incomplete.
    return Response.json({ choices: [{ finish_reason: observed.length === 1 ? 'length' : 'stop', message: { content: JSON.stringify({ type: 'answer', answer: 'Inspected.' }) } }] })
  }) as typeof fetch
  const result = await new BuilderToolLoop({ async generate(input) {
    return callLocalModel({ ...input, jsonObject: true }, { baseUrl: 'http://localhost/v1', model: 'configured-builder', timeoutMs: 5000 })
  } }, new InMemoryBuilderWorkspace(), { async run() { assert.fail('no execution authorized by this control') } })
    .run({ objective: 'Describe the workspace.', workspaceId: 'truncation', maxRounds: 1 })
  assert.equal(result.ok, true)
  assert.deepEqual(observed, [2400, 4800])
  assert.equal(result.trace.length, 0)
})

test('repeated provider length stops fail truthfully within the retry budget', async () => {
  let calls = 0
  const budgets: number[] = []
  globalThis.fetch = (async (_input, init) => {
    calls++
    budgets.push(JSON.parse(String(init?.body)).max_tokens)
    return Response.json({ choices: [{ finish_reason: 'length', message: { content: '{"type":"tool"' } }] })
  }) as typeof fetch
  const result = await new BuilderToolLoop({ async generate(input) {
    return callLocalModel({ ...input, jsonObject: true }, { baseUrl: 'http://localhost/v1', model: 'configured-builder', timeoutMs: 5000 })
  } }, new InMemoryBuilderWorkspace(), { async run() { assert.fail('partial output cannot execute') } })
    .run({ objective: 'Create:\n- one.js\n- two.js', workspaceId: 'repeated-truncation' })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, 'builder_model_output_limit')
  assert.equal(calls, 2)
  assert.deepEqual(budgets, [4096, 8192])
})

test('closed-looking JSON with broken source quoting is not reported as confirmed truncation', async () => {
  const result = await new BuilderToolLoop({ async generate() {
    return '{"type":"tool","toolId":"write_file","input":{"path":"app.js","content":"const s = "broken\\";"}}'
  } }, new InMemoryBuilderWorkspace(), { async run() { assert.fail('invalid JSON cannot execute') } })
    .run({ objective: 'Create app.js.', workspaceId: 'malformed-control' })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, 'builder_model_control_malformed_json')
})

test('JSON-mode provider rejection does not silently fall back to unconstrained generation', async () => {
  let calls = 0
  globalThis.fetch = (async () => { calls++; return new Response('unsupported response_format', { status: 400 }) }) as typeof fetch
  assert.equal(await callLocalModel({ prompt: 'Return JSON.', jsonObject: true }, { baseUrl: 'http://localhost/v1', model: 'configured-builder', timeoutMs: 5000 }), null)
  assert.equal(calls, 1)
})

test('direct text transformations use the dedicated DeepInfra flash editor with reasoning disabled', async () => {
  delete process.env.COS_DIRECT_TEXT_MODEL
  let observedBody: Record<string, unknown> = {}
  globalThis.fetch = (async (_input, init) => {
    observedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return Response.json({
      choices: [{ finish_reason: 'stop', message: { content: '{"answer":"Edited text.","confidence":0.99}' } }],
      usage: { prompt_tokens: 20, completion_tokens: 12, total_tokens: 32 },
    })
  }) as typeof fetch

  const result = await callLocalModel({
    prompt: 'Edit this text.',
    systemPrompt: 'Return ONLY strict JSON: {"answer":"...","confidence":0.0}.',
    maxTokens: 900,
    usageContext: { feature: 'direct_text_transformation', purpose: 'user_supplied_text_transformation' },
  }, {
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    model: 'Qwen/Qwen3.6-35B-A3B',
    apiKey: 'test-key',
    timeoutMs: 5000,
  })

  assert.equal(result, '{"answer":"Edited text.","confidence":0.99}')
  assert.equal(observedBody.model, 'zai-org/GLM-5.3-Flash')
  assert.equal(observedBody.reasoning_effort, 'none')
  assert.equal(observedBody.max_tokens, 900)
  assert.deepEqual(observedBody.response_format, { type: 'json_object' })
})

test('ordinary interactive COS answers retain the configured stronger model', async () => {
  let observedBody: Record<string, unknown> = {}
  globalThis.fetch = (async (_input, init) => {
    observedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'answer' } }] })
  }) as typeof fetch

  await callLocalModel({
    prompt: 'Answer a normal owner question.',
    usageContext: { feature: 'cos_interactive_answer', purpose: 'user_facing_response' },
  }, {
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    model: 'Qwen/Qwen3.6-35B-A3B',
    apiKey: 'test-key',
    timeoutMs: 5000,
  })

  assert.equal(observedBody.model, 'Qwen/Qwen3.6-35B-A3B')
  assert.equal(observedBody.reasoning_effort, 'low')
})

test('health check verifies the configured served model', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ id: 'signalboost-local-brain' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
  const health = await checkLocalInferenceHealth({ baseUrl: 'http://127.0.0.1:8000/v1', model: 'signalboost-local-brain', timeoutMs: 5000 })
  assert.deepEqual(health, { ok: true, model: 'signalboost-local-brain' })
})
