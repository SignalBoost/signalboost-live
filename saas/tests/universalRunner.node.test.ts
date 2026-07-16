// saas/tests/universalRunner.node.test.ts
//
// Pins the provider-neutral template hydration and JSON-path output mapping used
// by the configuration-driven universal provider runner.

import assert from 'node:assert/strict'
import test from 'node:test'
import { hydrateTemplate, readJsonPath } from '../lib/engine/universalRunner.ts'

test('hydrates nested request templates from runtime variables', () => {
  const hydrated = hydrateTemplate(
    {
      url: 'https://api.example.test/v1/{{account.id}}/jobs',
      body: {
        prompt: '{{prompt}}',
        options: ['{{format}}', '{{locale.region}}'],
        exactObject: '{{metadata}}',
      },
    },
    {
      account: { id: 'acct_123' },
      prompt: 'Create campaign assets',
      format: 'video',
      locale: { region: 'us' },
      metadata: { source: 'test' },
    },
  )

  assert.deepEqual(hydrated, {
    url: 'https://api.example.test/v1/acct_123/jobs',
    body: {
      prompt: 'Create campaign assets',
      options: ['video', 'us'],
      exactObject: { source: 'test' },
    },
  })
})

test('reads dot and bracket JSON paths from provider responses', () => {
  const payload = {
    data: {
      jobs: [{ id: 'job_1', output: { url: 'https://cdn.example.test/render.mp4' } }],
    },
  }

  assert.equal(readJsonPath(payload, '$.data.jobs[0].id'), 'job_1')
  assert.equal(readJsonPath(payload, 'data.jobs[0].output.url'), 'https://cdn.example.test/render.mp4')
  assert.equal(readJsonPath(payload, '$.data.jobs[1].id'), undefined)
})

test('maps singular response_mapping output_path values', async () => {
  const { runUniversalProvider } = await import('../lib/engine/universalRunner.ts')
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'row_1',
                  provider_id: 'dynamic-ai',
                  action_id: 'message',
                  is_active: true,
                  method: 'POST',
                  endpoint_template: 'https://api.example.test/messages',
                  header_template: { Authorization: 'Bearer {{credentials.apiKey}}' },
                  request_template: { prompt: '{{prompt}}' },
                  response_mapping: { output_path: 'choices[0].message.content' },
                  timeout_ms: 1000,
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  }

  const result = await runUniversalProvider({
    providerId: 'dynamic-ai',
    actionId: 'message',
    variables: { prompt: 'hello' },
    credentials: { apiKey: { secretRef: 'vault://tenant/provider/apiKey' } },
    resolveCredential: async () => 'resolved-token',
    supabase: supabase as never,
    fetchImpl: async (_url, init) => {
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer resolved-token')
      assert.equal(init?.body, JSON.stringify({ prompt: 'hello' }))
      return new Response(JSON.stringify({ choices: [{ message: { content: 'final answer' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.equal(result.success, true)
  assert.equal(result.outputs.output, 'final answer')
})

test('returns structured diagnostics when endpoint is offline', async () => {
  const { runUniversalProvider } = await import('../lib/engine/universalRunner.ts')
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'row_2',
                  provider_id: 'offline',
                  action_id: 'ping',
                  is_active: true,
                  method: 'GET',
                  endpoint_template: 'https://offline.example.test/ping',
                  header_template: {},
                  payload_template: {},
                  output_paths: {},
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  }

  const result = await runUniversalProvider({
    providerId: 'offline',
    actionId: 'ping',
    supabase: supabase as never,
    fetchImpl: async () => {
      throw new TypeError('fetch failed')
    },
  })

  assert.equal(result.success, false)
  assert.equal(result.ok, false)
  assert.equal(result.error, 'fetch failed')
  assert.equal(result.diagnostics?.stage, 'execute_request')
})
