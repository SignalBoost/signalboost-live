import test from 'node:test'
import assert from 'node:assert/strict'
import type { BrowserSessionPort } from '../lib/browser-runtime/contracts.ts'
import type { BrowserProfileSnapshot } from '../lib/browser-runtime/profile-portability.ts'
import {
  captureBrowserSessionSnapshot,
  deserializeBrowserSessionSnapshot,
  restoreBrowserSessionSnapshot,
  serializeBrowserSessionSnapshot,
} from '../lib/browser-runtime/session-snapshot.ts'

const profile: BrowserProfileSnapshot = {
  schemaVersion: '1.0.0',
  profileId: 'buyer-profile-001',
  createdAt: '2026-07-24T18:00:00.000Z',
  cookies: [{ name: 'session', value: 'abc', domain: 'example.com', path: '/', secure: true }],
  origins: [{ origin: 'https://example.com', localStorage: [{ name: 'theme', value: 'dark' }] }],
}

function createSession(overrides: Partial<BrowserSessionPort> = {}): BrowserSessionPort {
  return {
    page: {
      url: () => 'https://example.com/dashboard',
      goto: async () => undefined,
      click: async () => undefined,
      fill: async () => undefined,
      waitForSelector: async () => undefined,
    },
    profile: {
      exportProfile: async () => profile,
      importProfile: async () => undefined,
    },
    close: async () => undefined,
    ...overrides,
  }
}

test('captures, serializes, and restores a portable browser session snapshot', async () => {
  const imported: BrowserProfileSnapshot[] = []
  const navigated: string[] = []
  const session = createSession({
    page: {
      url: () => 'https://example.com/dashboard',
      goto: async url => { navigated.push(url) },
      click: async () => undefined,
      fill: async () => undefined,
      waitForSelector: async () => undefined,
    },
    profile: {
      exportProfile: async () => profile,
      importProfile: async value => { imported.push(value) },
    },
  })

  const snapshot = await captureBrowserSessionSnapshot(session, {
    snapshotId: 'session-snapshot-001',
    createdAt: '2026-07-24T19:00:00Z',
  })
  const serialized = serializeBrowserSessionSnapshot(snapshot)
  const restored = deserializeBrowserSessionSnapshot(serialized)

  await restoreBrowserSessionSnapshot(session, restored, {
    allowedOrigins: ['https://example.com'],
  })

  assert.equal(restored.currentUrl, 'https://example.com/dashboard')
  assert.equal(restored.createdAt, '2026-07-24T19:00:00.000Z')
  assert.equal(imported.length, 1)
  assert.deepEqual(navigated, ['https://example.com/dashboard'])
  assert.ok(Object.isFrozen(restored))
  assert.ok(Object.isFrozen(restored.profile))
})

test('supports URL-only capture and restore when profile portability is unavailable', async () => {
  const navigated: string[] = []
  const session = createSession({
    page: {
      url: () => 'https://example.com/public',
      goto: async url => { navigated.push(url) },
      click: async () => undefined,
      fill: async () => undefined,
      waitForSelector: async () => undefined,
    },
    profile: undefined,
  })
  const snapshot = await captureBrowserSessionSnapshot(session, {
    snapshotId: 'session-snapshot-002',
    createdAt: '2026-07-24T19:00:00Z',
    includeProfile: false,
  })

  await restoreBrowserSessionSnapshot(session, snapshot, {
    allowedOrigins: ['https://example.com'],
    restoreProfile: false,
  })

  assert.equal(snapshot.profile, undefined)
  assert.deepEqual(navigated, ['https://example.com/public'])
})

test('rejects restore to origins outside the buyer allowlist before mutation', async () => {
  let imported = false
  let navigated = false
  const session = createSession({
    page: {
      url: () => 'https://example.com',
      goto: async () => { navigated = true },
      click: async () => undefined,
      fill: async () => undefined,
      waitForSelector: async () => undefined,
    },
    profile: {
      exportProfile: async () => profile,
      importProfile: async () => { imported = true },
    },
  })
  const snapshot = await captureBrowserSessionSnapshot(session, {
    snapshotId: 'session-snapshot-003',
    createdAt: '2026-07-24T19:00:00Z',
  })

  await assert.rejects(() => restoreBrowserSessionSnapshot(session, snapshot, {
    allowedOrigins: ['https://buyer.example'],
  }), /origin_rejected/)
  assert.equal(imported, false)
  assert.equal(navigated, false)
})

test('fails clearly when requested profile import or export is unsupported', async () => {
  const session = createSession({ profile: undefined })
  await assert.rejects(() => captureBrowserSessionSnapshot(session, {
    snapshotId: 'session-snapshot-004',
    createdAt: '2026-07-24T19:00:00Z',
  }), /profile_export_unsupported/)

  const snapshot = {
    schemaVersion: '1.0.0' as const,
    snapshotId: 'session-snapshot-005',
    createdAt: '2026-07-24T19:00:00Z',
    currentUrl: 'https://example.com/',
    profile,
  }
  await assert.rejects(() => restoreBrowserSessionSnapshot(session, snapshot, {
    allowedOrigins: ['https://example.com'],
  }), /profile_import_unsupported/)
})

test('rejects malformed snapshots, unsafe URLs, duplicate origins, and invalid payloads', async () => {
  const session = createSession()
  await assert.rejects(() => restoreBrowserSessionSnapshot(session, {
    schemaVersion: '2.0.0' as never,
    snapshotId: 'bad',
    createdAt: '2026-07-24T19:00:00Z',
    currentUrl: 'https://example.com/',
  }, { allowedOrigins: ['https://example.com'] }), /schema_invalid/)

  await assert.rejects(() => restoreBrowserSessionSnapshot(session, {
    schemaVersion: '1.0.0',
    snapshotId: 'bad-url',
    createdAt: '2026-07-24T19:00:00Z',
    currentUrl: 'file:///tmp/profile',
  }, { allowedOrigins: ['https://example.com'] }), /url_invalid/)

  await assert.rejects(() => restoreBrowserSessionSnapshot(session, {
    schemaVersion: '1.0.0',
    snapshotId: 'duplicate-origins',
    createdAt: '2026-07-24T19:00:00Z',
    currentUrl: 'https://example.com/',
  }, { allowedOrigins: ['https://example.com', 'https://example.com'] }), /allowed_origin_duplicate/)

  assert.throws(() => deserializeBrowserSessionSnapshot('{bad json'), /payload_invalid/)
})
