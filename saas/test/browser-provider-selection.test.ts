import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BROWSER_PROVIDER_CAPABILITIES_SCHEMA_VERSION,
  type BrowserProviderCapabilities,
} from '../lib/browser-runtime/provider-capabilities.ts'
import {
  BROWSER_PROVIDER_SELECTION_SCHEMA_VERSION,
  selectBrowserProvider,
  type BrowserProviderSelectionCandidate,
} from '../lib/browser-runtime/provider-selection.ts'

function capabilities(
  provider: string,
  overrides: Partial<BrowserProviderCapabilities> = {},
): BrowserProviderCapabilities {
  return {
    schemaVersion: BROWSER_PROVIDER_CAPABILITIES_SCHEMA_VERSION,
    provider,
    sessionSnapshotCapture: true,
    sessionSnapshotRestore: true,
    profileExport: true,
    profileImport: true,
    ...overrides,
  }
}

function candidate(
  provider: string,
  overrides: Partial<BrowserProviderSelectionCandidate> = {},
): BrowserProviderSelectionCandidate {
  return {
    provider,
    capabilities: capabilities(provider),
    health: 'healthy',
    priority: 0,
    costWeight: 0,
    regions: ['us-east'],
    modes: ['observe', 'prepare_change', 'execute_change'],
    ...overrides,
  }
}

test('selects the highest scoring eligible provider deterministically', () => {
  const result = selectBrowserProvider({
    schemaVersion: BROWSER_PROVIDER_SELECTION_SCHEMA_VERSION,
    candidates: [
      candidate('steel', { priority: 2, costWeight: 5 }),
      candidate('browserbase', { priority: 2, costWeight: 1 }),
      candidate('browserless', { priority: 1 }),
    ],
    region: 'US-EAST',
    mode: 'execute_change',
  })

  assert.equal(result.selected.provider, 'browserbase')
  assert.deepEqual(result.ranked.map(entry => entry.provider), [
    'browserbase',
    'steel',
    'browserless',
  ])
})

test('filters unavailable, degraded, regional, mode, and capability mismatches', () => {
  const result = selectBrowserProvider({
    schemaVersion: BROWSER_PROVIDER_SELECTION_SCHEMA_VERSION,
    candidates: [
      candidate('eligible'),
      candidate('unavailable', { health: 'unavailable' }),
      candidate('degraded', { health: 'degraded' }),
      candidate('wrong-region', { regions: ['eu-west'] }),
      candidate('wrong-mode', { modes: ['observe'] }),
      candidate('missing-profile', {
        capabilities: capabilities('missing-profile', { profileImport: false }),
      }),
    ],
    region: 'us-east',
    mode: 'execute_change',
    requiredCapabilities: ['profileImport'],
  })

  assert.equal(result.selected.provider, 'eligible')
  assert.deepEqual(result.rejected, [
    { provider: 'degraded', reasons: ['provider_degraded'] },
    { provider: 'missing-profile', reasons: ['capability_missing:profileImport'] },
    { provider: 'unavailable', reasons: ['provider_unavailable'] },
    { provider: 'wrong-mode', reasons: ['mode_unsupported'] },
    { provider: 'wrong-region', reasons: ['region_unsupported'] },
  ])
})

test('allows degraded providers only when explicitly enabled', () => {
  const result = selectBrowserProvider({
    schemaVersion: BROWSER_PROVIDER_SELECTION_SCHEMA_VERSION,
    candidates: [candidate('fallback', { health: 'degraded' })],
    allowDegraded: true,
  })

  assert.equal(result.selected.provider, 'fallback')
  assert.equal(result.selected.health, 'degraded')
})

test('uses provider name as a stable tie breaker', () => {
  const result = selectBrowserProvider({
    schemaVersion: BROWSER_PROVIDER_SELECTION_SCHEMA_VERSION,
    candidates: [candidate('steel'), candidate('browserbase')],
  })

  assert.deepEqual(result.ranked.map(entry => entry.provider), ['browserbase', 'steel'])
})

test('rejects duplicate providers and empty eligible sets', () => {
  assert.throws(() => selectBrowserProvider({
    schemaVersion: BROWSER_PROVIDER_SELECTION_SCHEMA_VERSION,
    candidates: [candidate('same'), candidate('same')],
  }), /browser_provider_selection_provider_duplicate/)

  assert.throws(() => selectBrowserProvider({
    schemaVersion: BROWSER_PROVIDER_SELECTION_SCHEMA_VERSION,
    candidates: [candidate('offline', { health: 'unavailable' })],
  }), /browser_provider_selection_no_eligible_provider/)
})
