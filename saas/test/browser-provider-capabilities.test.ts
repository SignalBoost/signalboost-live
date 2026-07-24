import test from 'node:test'
import assert from 'node:assert/strict'
import type { BrowserSessionFactory, BrowserSessionPort } from '../lib/browser-runtime/contracts.ts'
import {
  BROWSER_PROVIDER_CAPABILITIES_SCHEMA_VERSION,
  assertBrowserSessionMigrationCapabilities,
  negotiateBrowserSessionMigrationCapabilities,
  type BrowserSessionFactoryWithCapabilities,
} from '../lib/browser-runtime/provider-capabilities.ts'

function createSession(withProfile = false): BrowserSessionPort {
  return {
    page: {
      url: () => 'https://example.com/account',
      goto: async () => undefined,
      click: async () => undefined,
      fill: async () => undefined,
      waitForSelector: async () => undefined,
    },
    ...(withProfile ? {
      profile: {
        exportProfile: async () => ({
          schemaVersion: '1.0.0',
          profileId: 'profile-001',
          createdAt: '2026-07-24T20:00:00.000Z',
          cookies: [],
          origins: [],
        }),
        importProfile: async () => undefined,
      },
    } : {}),
    close: async () => undefined,
  }
}

function createFactory(overrides: Partial<BrowserSessionFactoryWithCapabilities['capabilities']> = {}) {
  const factory: BrowserSessionFactoryWithCapabilities = {
    capabilities: {
      schemaVersion: BROWSER_PROVIDER_CAPABILITIES_SCHEMA_VERSION,
      provider: 'target-provider',
      sessionSnapshotCapture: true,
      sessionSnapshotRestore: true,
      profileExport: true,
      profileImport: true,
      ...overrides,
    },
    open: async () => createSession(true),
  }
  return factory
}

test('negotiates a compatible profile migration', () => {
  const result = negotiateBrowserSessionMigrationCapabilities({
    sourceSession: createSession(true),
    targetFactory: createFactory(),
    includeProfile: true,
  })

  assert.equal(result.compatible, true)
  assert.deepEqual(result.missing, [])
  assert.deepEqual(result.required, [
    'session_snapshot_capture',
    'session_snapshot_restore',
    'profile_export',
    'profile_import',
  ])
})

test('fails before launch when a declared target cannot restore profiles', () => {
  let opened = false
  const target = createFactory({ profileImport: false })
  const factory: BrowserSessionFactory = {
    ...target,
    open: async request => {
      opened = true
      return target.open(request)
    },
  }

  assert.throws(() => assertBrowserSessionMigrationCapabilities({
    sourceSession: createSession(true),
    targetFactory: factory,
    includeProfile: true,
  }), /browser_session_migration_capability_mismatch:profile_import/)
  assert.equal(opened, false)
})

test('detects missing source profile export support', () => {
  const result = negotiateBrowserSessionMigrationCapabilities({
    sourceSession: createSession(false),
    targetFactory: createFactory(),
    includeProfile: true,
  })

  assert.equal(result.compatible, false)
  assert.deepEqual(result.missing, ['profile_export'])
})

test('preserves backward compatibility for factories without declarations', () => {
  const factory: BrowserSessionFactory = { open: async () => createSession(false) }
  const result = negotiateBrowserSessionMigrationCapabilities({
    sourceSession: createSession(false),
    targetFactory: factory,
    includeProfile: false,
  })

  assert.equal(result.compatible, true)
  assert.equal(result.target, undefined)
})
