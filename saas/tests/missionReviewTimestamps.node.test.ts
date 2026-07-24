import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatTimestamp } from '../app/dashboard/supervisor/missions/reviews/formatTimestamp.ts'

const client = () => readFileSync(new URL('../app/dashboard/supervisor/missions/reviews/MissionReviewClient.tsx', import.meta.url), 'utf8')
const unavailable = 'Unavailable'

test('safe timestamp helper preserves locale rendering for valid review timestamps', () => {
  const source = client()
  const value = '2026-07-23T12:34:56.000Z'
  assert.equal(formatTimestamp(value, unavailable), new Date(value).toLocaleString())
  assert.match(source, /import \{ formatTimestamp \} from '\.\/formatTimestamp'/)
  assert.match(source, /formatTimestamp\(review\.createdAt, labels\.unavailable\)/)
  assert.match(source, /formatTimestamp\(review\.routedAt, labels\.unavailable\)/)
})

test('invalid review timestamps use the localized unavailable fallback', () => {
  assert.equal(formatTimestamp('not-a-timestamp', unavailable), unavailable)
})

test('missing optional timestamps use the localized unavailable fallback', () => {
  assert.equal(formatTimestamp(undefined, unavailable), unavailable)
})

test('invalid diagnostics timestamps use the localized unavailable fallback', () => {
  const source = client()
  assert.equal(formatTimestamp('2026-99-99', unavailable), unavailable)
  assert.match(source, /formatTimestamp\(diagnostics\.oldestRoutedAt, labels\.unavailable\)/)
  assert.match(source, /formatTimestamp\(diagnostics\.newestRoutedAt, labels\.unavailable\)/)
})

test('invalid mission-summary timestamps use the localized unavailable fallback', () => {
  const source = client()
  assert.equal(formatTimestamp('invalid-mission-summary-date', unavailable), unavailable)
  assert.match(source, /formatTimestamp\(detail\.mission\.createdAt, labels\.unavailable\)/)
  assert.match(source, /formatTimestamp\(detail\.mission\.updatedAt, labels\.unavailable\)/)
})

test('detail timestamps use the same safe helper and Invalid Date is never rendered', () => {
  const source = client()
  assert.match(source, /formatTimestamp\(detail\.createdAt, labels\.unavailable\)/)
  assert.match(source, /formatTimestamp\(detail\.routedAt, labels\.unavailable\)/)
  assert.equal(formatTimestamp('invalid-date', unavailable).includes('Invalid Date'), false)
  assert.doesNotMatch(source, /\bformatTime\b|Invalid Date/)
})

test('timestamp handling preserves independent GET-only read-only review behavior', () => {
  const source = client()
  const helper = readFileSync(new URL('../app/dashboard/supervisor/missions/reviews/formatTimestamp.ts', import.meta.url), 'utf8')
  assert.match(helper, /try \{[\s\S]*?return timestamp\.toLocaleString\(\)[\s\S]*?\} catch \{\n    return fallback\n  \}/)
  assert.match(helper, /Number\.isFinite\(timestamp\.getTime\(\)\)/)
  assert.match(source, /const diagnosticsController = useRef<AbortController \| null>\(null\)/)
  assert.match(source, /const detailController = useRef<AbortController \| null>\(null\)/)
  assert.equal((source.match(/method: 'GET'/g) || []).length, 3)
  assert.doesNotMatch(source, /method:\s*'(POST|PUT|PATCH|DELETE)'/)
  const controls = source.match(/<button[^>]*>[\s\S]*?<\/button>/g) || []
  assert.doesNotMatch(controls.join(' '), /approve|reject|resolve|replay|execute|repair|cancel|delete|edit/i)
})
