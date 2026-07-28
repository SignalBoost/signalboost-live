import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const page = hydrateLocalizedSource(readFileSync(new URL('../app/dashboard/supervisor/protocol-capabilities/page.tsx', import.meta.url), 'utf8'))
const client = hydrateLocalizedSource(readFileSync(new URL('../app/dashboard/supervisor/protocol-capabilities/ProtocolCapabilityCatalogClient.tsx', import.meta.url), 'utf8'))

test('protocol catalog resolves the five supported locales with English fallback', () => {
  for (const locale of ['en','es','pt','pl','ru']) assert.match(client, new RegExp(`\\b${locale}: \\{`))
  assert.match(page, /sb_locale/)
  assert.match(page, /includes\(candidate\) \? candidate : 'en'/)
  assert.match(client, /dictionaries\[locale\] \|\| dictionaries\.en/)
})

test('protocol catalog localizes access, loading, boundaries, and metrics', () => {
  for (const key of ['adminRequired','loading','protocols','mutating','supervisoryOnly','safetyClassified','operations','safetyHints','evidence','footer']) assert.match(client, new RegExp(key))
  assert.match(page, /labels\.adminRequired/)
  assert.match(client, /labels\.mutatingBoundary/)
  assert.match(client, /labels\.supervisoryBoundary/)
})

test('localized protocol catalog remains GET-only and read-only', () => {
  assert.match(client, /method: 'GET'/)
  assert.match(client, /cache: 'no-store'/)
  assert.doesNotMatch(client, /onClick=/)
  assert.doesNotMatch(client, /method: 'POST'/)
  assert.doesNotMatch(client, /method: 'PUT'/)
  assert.doesNotMatch(client, /method: 'DELETE'/)
})