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
