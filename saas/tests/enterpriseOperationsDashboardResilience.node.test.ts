import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { parseOperationsDashboardApiResponse } from '../lib/enterprise/operations/operationsDashboardResponse.ts'
import { getOperationsDashboardStateCopy, operationsDashboardStateCopy } from '../lib/i18n/operationsDashboardStateCopy.ts'

const snapshot = {
  organizationId: 'org-1',
  generatedAt: '2026-07-19T02:00:00.000Z',
  health: { state: 'green', score: 100 },
  incidents: {}, verification: {}, learning: {}, playbooks: {}, recentIncidentIds: [],
}

test('dashboard response parser accepts only the supported schema and validated snapshot', () => {
  const response = parseOperationsDashboardApiResponse({ schemaVersion: 'operations-intelligence-response-v1', snapshot })
  assert.deepEqual(response.snapshot, snapshot)
  assert.throws(() => parseOperationsDashboardApiResponse(null), /must be an object/)
  assert.throws(() => parseOperationsDashboardApiResponse({ schemaVersion: 'future-v2', snapshot }), /unsupported/)
  assert.throws(() => parseOperationsDashboardApiResponse({ schemaVersion: 'operations-intelligence-response-v1' }), /snapshot or error/)
  assert.throws(() => parseOperationsDashboardApiResponse({ schemaVersion: 'operations-intelligence-response-v1', snapshot, error: 'bad' }), /both snapshot and error/)
  assert.throws(() => parseOperationsDashboardApiResponse({ schemaVersion: 'operations-intelligence-response-v1', snapshot: { ...snapshot, generatedAt: 'bad' } }), /generatedAt/)
})

test('dashboard state copy is complete and localized across all five required languages', () => {
  const locales = ['en', 'es', 'pt', 'pl', 'ru'] as const
  const keys = Object.keys(operationsDashboardStateCopy.en).sort()
  for (const locale of locales) {
    const copy = operationsDashboardStateCopy[locale]
    assert.deepEqual(Object.keys(copy).sort(), keys)
    for (const value of Object.values(copy)) assert.ok(value.trim())
  }
  assert.equal(getOperationsDashboardStateCopy('unsupported'), operationsDashboardStateCopy.en)
  for (const locale of locales.slice(1)) assert.notEqual(operationsDashboardStateCopy[locale].unavailable, operationsDashboardStateCopy.en.unavailable)
})

test('dashboard loader parses responses before rendering and rejects cross-organization snapshots', async () => {
  const source = await readFile(new URL('../components/enterprise/ExecutiveOperationsDashboardLoader.tsx', import.meta.url), 'utf8')
  assert.match(source, /parseOperationsDashboardApiResponse\(await response\.json\(\)\)/)
  assert.match(source, /body\.snapshot\.organizationId !== organizationId/)
  assert.match(source, /setSnapshot\(null\)/)
  assert.match(source, /cache: 'no-store'/)
  assert.match(source, /AbortController/)
})
