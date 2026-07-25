import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeProviderCapabilityResponse } from '../lib/hub/provider-capability-client'

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
