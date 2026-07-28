import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const source = hydrateLocalizedSource(readFileSync(new URL('../app/dashboard/supervisor/protocol-capabilities/ProtocolCapabilityCatalogClient.tsx', import.meta.url), 'utf8'))

test('protocol catalog exposes generated timestamp and schema contract', () => {
  assert.match(source, /snapshot\.generatedAt/)
  assert.match(source, /snapshot\.schemaVersion/)
  assert.match(source, /<time dateTime=\{snapshot\.generatedAt\}>/)
})

test('freshness classification is bounded and deterministic', () => {
  assert.match(source, /const STALE_AFTER_MS = 5 \* 60 \* 1000/)
  assert.match(source, /export const snapshotFreshness/)
  assert.match(source, /return 'invalid' as const/)
  assert.match(source, /\? 'stale' as const : 'fresh' as const/)
})

test('freshness diagnostics preserve the read-only boundary', () => {
  assert.match(source, /method: 'GET'/)
  assert.match(source, /cache: 'no-store'/)
  assert.doesNotMatch(source, /onClick=/)
  assert.doesNotMatch(source, /method: 'POST'/)
  assert.doesNotMatch(source, /method: 'PUT'/)
  assert.doesNotMatch(source, /method: 'DELETE'/)
})