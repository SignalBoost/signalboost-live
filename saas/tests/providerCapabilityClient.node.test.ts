import assert from 'node:assert/strict'
import test from 'node:test'

import {
  discoverReviewedProviderCapabilities,
  normalizeProviderCapabilityResponse,
} from '../lib/hub/provider-capability-client'

test('normalizes only reviewed available execution modes', () => {
  const normalized = normalizeProviderCapabilityResponse({
    ok: true,
    preferredMode: 'browser_agent',
    capabilities: [
      { mode: 'direct', available: false },
      { mode: 'cosa_pr', available: true },
      {
        mode: 'browser_agent',
        available: true,
        browserAdapterId: 'adapter.reviewed',
        approvedOrigin: 'https://provider.example',
      },
    ],
  })

  assert.equal(normalized.ok, true)
  assert.deepEqual(normalized.availableModes, ['cosa_pr', 'browser_agent'])
  assert.equal(normalized.preferredMode, 'browser_agent')
  assert.equal(normalized.browserAdapterId, 'adapter.reviewed')
  assert.deepEqual(normalized.approvedOrigins, ['https://provider.example'])
})

test('falls back to the first reviewed mode when the preferred mode is unavailable', () => {
  const normalized = normalizeProviderCapabilityResponse({
    ok: true,
    preferredMode: 'direct',
    capabilities: [
      { mode: 'direct', available: false },
      { mode: 'manual', available: true },
    ],
  })

  assert.equal(normalized.preferredMode, 'manual')
  assert.deepEqual(normalized.availableModes, ['manual'])
})

test('fails closed when discovery fails or no reviewed modes exist', () => {
  const discoveryFailure = normalizeProviderCapabilityResponse({ ok: false })
  assert.equal(discoveryFailure.ok, false)
  assert.equal(discoveryFailure.error, 'provider_capabilities_unavailable')

  const noReviewedModes = normalizeProviderCapabilityResponse({
    ok: true,
    capabilities: [{ mode: 'direct', available: false }],
  })
  assert.equal(noReviewedModes.ok, false)
  assert.equal(noReviewedModes.error, 'provider_execution_mode_unavailable')
})

test('does not copy browser metadata from an unavailable browser path', () => {
  const normalized = normalizeProviderCapabilityResponse({
    ok: true,
    capabilities: [
      {
        mode: 'browser_agent',
        available: false,
        browserAdapterId: 'unreviewed-adapter',
        approvedOrigin: 'https://unreviewed.example',
      },
      { mode: 'manual', available: true },
    ],
  })

  assert.equal(normalized.browserAdapterId, null)
  assert.deepEqual(normalized.approvedOrigins, [])
})

test('discovers and normalizes reviewed capabilities through the authenticated route', async () => {
  let requestBody = ''
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = String(init?.body || '')
    return new Response(JSON.stringify({
      ok: true,
      preferredMode: 'cosa_pr',
      capabilities: [
        { mode: 'direct', available: false },
        { mode: 'cosa_pr', available: true },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  const discovered = await discoverReviewedProviderCapabilities(' github.create_issue ', fetcher)

  assert.deepEqual(JSON.parse(requestBody), { templateId: 'github.create_issue' })
  assert.equal(discovered.ok, true)
  assert.equal(discovered.preferredMode, 'cosa_pr')
  assert.deepEqual(discovered.availableModes, ['cosa_pr'])
})

test('capability discovery fails closed for invalid input, route errors, and network errors', async () => {
  const invalid = await discoverReviewedProviderCapabilities('')
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error, 'template_id_required')

  const routeFailure = await discoverReviewedProviderCapabilities('github.create_issue', (async () => (
    new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch)
  assert.equal(routeFailure.ok, false)
  assert.equal(routeFailure.error, 'Unauthorized')

  const networkFailure = await discoverReviewedProviderCapabilities('github.create_issue', (async () => {
    throw new Error('offline')
  }) as typeof fetch)
  assert.equal(networkFailure.ok, false)
  assert.equal(networkFailure.error, 'provider_capabilities_unavailable')
})

test('capability discovery preserves abort semantics', async () => {
  const aborted = new DOMException('aborted', 'AbortError')
  await assert.rejects(
    discoverReviewedProviderCapabilities('github.create_issue', (async () => {
      throw aborted
    }) as typeof fetch),
    (error: unknown) => error === aborted,
  )
})
