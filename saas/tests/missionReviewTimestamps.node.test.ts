import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const client = () => hydrateLocalizedSource(readFileSync(new URL('../app/dashboard/supervisor/missions/reviews/MissionReviewClient.tsx', import.meta.url), 'utf8'))

test('safe timestamp helper preserves locale rendering for valid review timestamps', () => {
  const source = client()
  assert.match(source, /function formatTimestamp\(value: string \| undefined, fallback: string\): string/)
  assert.match(source, /const timestamp = new Date\(value\)/)
  assert.match(source, /return timestamp\.toLocaleString\(\)/)
  assert.match(source, /formatTimestamp\(review\.createdAt, labels\.unavailable\)/)
  assert.match(source, /formatTimestamp\(review\.routedAt, labels\.unavailable\)/)
})

test('invalid, non-finite, and missing timestamps use the localized unavailable fallback', () => {
  const source = client()
  assert.match(source, /if \(!value\) return fallback/)
  assert.match(source, /if \(!Number\.isFinite\(timestamp\.getTime\(\)\)\) return fallback/)
  assert.match(source, /catch \{\n    return fallback\n  \}/)
  assert.match(source, /formatTimestamp\(diagnostics\.oldestRoutedAt, labels\.unavailable\)/)
  assert.match(source, /formatTimestamp\(diagnostics\.newestRoutedAt, labels\.unavailable\)/)
})

test('detail and mission-summary timestamps use the same safe helper and never render Invalid Date', () => {
  const source = client()
  assert.match(source, /formatTimestamp\(detail\.createdAt, labels\.unavailable\)/)
  assert.match(source, /formatTimestamp\(detail\.routedAt, labels\.unavailable\)/)
  assert.match(source, /formatTimestamp\(detail\.mission\.createdAt, labels\.unavailable\)/)
  assert.match(source, /formatTimestamp\(detail\.mission\.updatedAt, labels\.unavailable\)/)
  assert.doesNotMatch(source, /\bformatTime\b|Invalid Date/)
})

test('timestamp handling preserves independent GET-only read-only review behavior', () => {
  const source = client()
  assert.match(source, /const diagnosticsController = useRef<AbortController \| null>\(null\)/)
  assert.match(source, /const detailController = useRef<AbortController \| null>\(null\)/)
  assert.equal((source.match(/method: 'GET'/g) || []).length, 3)
  assert.doesNotMatch(source, /method:\s*'(POST|PUT|PATCH|DELETE)'/)
  const controls = source.match(/<button[^>]*>[\s\S]*?<\/button>/g) || []
  assert.doesNotMatch(controls.join(' '), /approve|reject|resolve|replay|execute|repair|cancel|delete|edit/i)
})
