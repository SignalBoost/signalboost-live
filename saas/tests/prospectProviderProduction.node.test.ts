import assert from 'node:assert/strict'
import test from 'node:test'

import { availableProspectProviders, runProspectProvider } from '../lib/prospect-intelligence/provider-service.ts'

const context = {
  connectionId: 'test',
  secretReferences: [{ kind: 'environment' as const, reference: 'CRUNCHBASE_API_KEY' }],
  locale: 'en' as const,
}

test('production prospect provider registry exposes the five enterprise providers', () => {
  const ids = availableProspectProviders().map(provider => provider.providerId)
  for (const id of ['cognism', 'crunchbase', 'dnb-direct-plus', 'zoominfo', 'orbis']) assert.ok(ids.includes(id), id)
})

test('live provider execution is denied unless explicitly enabled', async () => {
  const previous = process.env.PROSPECT_LIVE_PROVIDER_EXECUTION
  delete process.env.PROSPECT_LIVE_PROVIDER_EXECUTION
  try {
    const result = await runProspectProvider({ providerId: 'crunchbase', capability: 'company_search', input: { company: 'SignalBoost' }, context })
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'PROSPECT_LIVE_PROVIDER_EXECUTION_DISABLED')
  } finally {
    if (previous === undefined) delete process.env.PROSPECT_LIVE_PROVIDER_EXECUTION
    else process.env.PROSPECT_LIVE_PROVIDER_EXECUTION = previous
  }
})

test('Crunchbase adapter performs an authenticated v4 organization search', async () => {
  const previousFlag = process.env.PROSPECT_LIVE_PROVIDER_EXECUTION
  const previousKey = process.env.CRUNCHBASE_API_KEY
  const previousFetch = globalThis.fetch
  process.env.PROSPECT_LIVE_PROVIDER_EXECUTION = '1'
  process.env.CRUNCHBASE_API_KEY = 'test-key'
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(url)
    capturedInit = init
    return new Response(JSON.stringify({ entities: [{ identifier: { value: 'SignalBoost' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-ratelimit-remaining': '99' },
    })
  }) as typeof fetch
  try {
    const result = await runProspectProvider<Record<string, unknown>, any>({ providerId: 'crunchbase', capability: 'company_search', input: { company: 'SignalBoost', limit: 5 }, context })
    assert.equal(result.ok, true)
    assert.equal(capturedUrl, 'https://api.crunchbase.com/v4/data/searches/organizations')
    assert.equal((capturedInit?.headers as Record<string, string>)['X-cb-user-key'], 'test-key')
    assert.equal(capturedInit?.method, 'POST')
  } finally {
    globalThis.fetch = previousFetch
    if (previousFlag === undefined) delete process.env.PROSPECT_LIVE_PROVIDER_EXECUTION
    else process.env.PROSPECT_LIVE_PROVIDER_EXECUTION = previousFlag
    if (previousKey === undefined) delete process.env.CRUNCHBASE_API_KEY
    else process.env.CRUNCHBASE_API_KEY = previousKey
  }
})
