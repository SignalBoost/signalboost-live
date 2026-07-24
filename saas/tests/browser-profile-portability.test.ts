import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deserializeBrowserProfileSnapshot,
  normalizeBrowserProfileSnapshot,
  serializeBrowserProfileSnapshot,
} from '../lib/browser-runtime/profile-portability.ts'

const snapshot = {
  schemaVersion: '1.0.0' as const,
  profileId: 'buyer-profile-001',
  createdAt: '2026-07-24T18:00:00.000Z',
  cookies: [
    { name: 'session', value: 'abc', domain: 'example.com', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' as const },
    { name: 'prefs', value: 'compact', domain: 'app.example.com', path: '/' },
  ],
  origins: [
    { origin: 'https://example.com', localStorage: [{ name: 'theme', value: 'dark' }] },
  ],
}

test('normalizes and freezes portable browser profiles', () => {
  const normalized = normalizeBrowserProfileSnapshot(snapshot)
  assert.equal(normalized.profileId, 'buyer-profile-001')
  assert.ok(Object.isFrozen(normalized))
  assert.ok(Object.isFrozen(normalized.cookies))
  assert.ok(Object.isFrozen(normalized.origins[0].localStorage))
})

test('serializes profiles deterministically and restores them', () => {
  const first = serializeBrowserProfileSnapshot(snapshot)
  const second = serializeBrowserProfileSnapshot({
    ...snapshot,
    cookies: [...snapshot.cookies].reverse(),
  })
  assert.equal(first, second)
  assert.deepEqual(deserializeBrowserProfileSnapshot(first), normalizeBrowserProfileSnapshot(snapshot))
})

test('rejects duplicate cookies and storage keys', () => {
  assert.throws(() => normalizeBrowserProfileSnapshot({
    ...snapshot,
    cookies: [snapshot.cookies[0], snapshot.cookies[0]],
  }), /cookie_duplicate/)

  assert.throws(() => normalizeBrowserProfileSnapshot({
    ...snapshot,
    origins: [{ origin: 'https://example.com', localStorage: [{ name: 'x', value: '1' }, { name: 'x', value: '2' }] }],
  }), /storage_duplicate/)
})

test('rejects invalid origins, schemas, timestamps, and payloads', () => {
  assert.throws(() => normalizeBrowserProfileSnapshot({ ...snapshot, schemaVersion: '2.0.0' as never }), /schema_invalid/)
  assert.throws(() => normalizeBrowserProfileSnapshot({ ...snapshot, createdAt: 'not-a-date' }), /created_at_invalid/)
  assert.throws(() => normalizeBrowserProfileSnapshot({ ...snapshot, origins: [{ origin: 'file:///tmp', localStorage: [] }] }), /origin_invalid/)
  assert.throws(() => deserializeBrowserProfileSnapshot('{bad json'), /payload_invalid/)
})
