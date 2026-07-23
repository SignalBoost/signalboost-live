import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createManualReviewDiagnosticsResponse, parseManualReviewDiagnosticsResponse } from '../lib/supervisor/missions/review-diagnostics.ts'

const generatedAt = '2026-07-23T00:00:00.000Z'
const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

test('empty, healthy, and warning status rules are deterministic', () => {
  assert.equal(createManualReviewDiagnosticsResponse({ total: 0, routed: 0 }, generatedAt).status, 'empty')
  assert.equal(createManualReviewDiagnosticsResponse({ total: 1, routed: 1, newestRoutedAt: '2026-07-20T00:00:00.000Z' }, generatedAt).status, 'healthy')
  assert.equal(createManualReviewDiagnosticsResponse({ total: 1, routed: 1, newestRoutedAt: '2026-07-15T23:59:59.999Z' }, generatedAt).status, 'warning')
})

test('UI parser rejects invalid API payloads, negative counts, and unknown statuses', () => {
  const valid = { generatedAt, total: 2, routed: 1, oldestRoutedAt: '2026-07-20T00:00:00.000Z', newestRoutedAt: '2026-07-21T00:00:00.000Z', status: 'healthy' }
  assert.deepEqual(parseManualReviewDiagnosticsResponse(valid), valid)
  for (const value of [{ ...valid, total: -1 }, { ...valid, total: 1.5 }, { ...valid, newestRoutedAt: 'not-a-time' }, { ...valid, status: 'critical' }, { ...valid, routed: '1' }]) assert.equal(parseManualReviewDiagnosticsResponse(value), null)
})

test('diagnostics endpoint uses admin authentication, is GET-only, and does not mutate', () => {
  const route = source('../app/api/internal/supervisor/missions/reviews/diagnostics/route.ts')
  assert.match(route, /requireAdmin\(\)/)
  assert.match(route, /SupabaseMissionManualReviewStore/)
  assert.match(route, /\.diagnostics\(\)/)
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/)
  assert.doesNotMatch(route, /\.(insert|update|delete|rpc)\(/)
})

test('diagnostics UI renders the summary without mutation buttons or methods', () => {
  const client = source('../app/dashboard/supervisor/missions/reviews/MissionReviewClient.tsx')
  assert.match(client, /parseManualReviewDiagnosticsResponse/)
  assert.match(client, /reviews\/diagnostics/)
  for (const field of ['diagnostics.total', 'diagnostics.routed', 'diagnostics.oldestRoutedAt', 'diagnostics.newestRoutedAt', 'diagnostics.duplicateRoutesPrevented', 'diagnostics.status']) assert.match(client, new RegExp(field.replaceAll('.', '\\.')))
  const section = client.slice(client.indexOf('<section style={diagnosticsPanel}'), client.indexOf('<form onSubmit'))
  assert.doesNotMatch(section, /<button/)
  assert.doesNotMatch(client, /method:\s*'(POST|PUT|PATCH|DELETE)'/)
})
