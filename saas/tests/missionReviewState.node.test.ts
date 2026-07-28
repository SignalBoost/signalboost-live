import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const client = () => hydrateLocalizedSource(readFileSync(new URL('../app/dashboard/supervisor/missions/reviews/MissionReviewClient.tsx', import.meta.url), 'utf8'))

test('diagnostics and list failures preserve the other successful section', () => {
  const source = client()
  assert.match(source, /catch \(cause\) \{\n      if \(diagnosticsRequest\.current !== request \|\| controller\.signal\.aborted\) return\n      setDiagnosticsError/)
  assert.doesNotMatch(source, /setDiagnostics\(null\)/)
  assert.match(source, /setItems\(\[\]\); setNextCursor\(undefined\); setError/)
  assert.doesNotMatch(source, /load\(activeCursor = cursor\)[\s\S]*?setDiagnostics\(/)
})

test('detail failures stay isolated from review-list state', () => {
  const source = client()
  const detail = source.slice(source.indexOf('async function openDetail'), source.indexOf('async function copyFingerprint'))
  assert.match(detail, /setDetailError\(cause instanceof Error \? cause\.message : labels\.error\)/)
  assert.doesNotMatch(detail, /setItems\(|setNextCursor\(|setError\(/)
  const list = source.slice(source.indexOf('async function load(activeCursor'), source.indexOf('useEffect(() => { void load()'))
  assert.doesNotMatch(list, /setDetail\(null\)/)
})

test('diagnostics retry reloads only diagnostics and detail retry reloads only the selected detail', () => {
  const source = client()
  assert.match(source, /onClick=\{\(\) => void loadDiagnostics\(\)\}/)
  assert.match(source, /const reviewId = detailReviewId\.current; if \(reviewId\) void openDetail\(reviewId\)/)
  assert.doesNotMatch(source, /retryDiagnostics[\s\S]*?void load\(\)/)
})

test('each independent stream rejects stale responses and retries remain GET-only', () => {
  const source = client()
  assert.match(source, /const diagnosticsController = useRef<AbortController \| null>\(null\)/)
  assert.match(source, /const diagnosticsRequest = useRef\(0\)/)
  assert.match(source, /diagnosticsController\.current\?\.abort\(\)[\s\S]*?signal: controller\.signal/)
  assert.match(source, /if \(diagnosticsRequest\.current !== request \|\| controller\.signal\.aborted\) return/)
  assert.equal((source.match(/method: 'GET'/g) || []).length, 3)
  assert.doesNotMatch(source, /method:\s*'(POST|PUT|PATCH|DELETE)'/)
})

test('the retry affordances preserve the read-only boundary and no mutation controls appear', () => {
  const source = client()
  assert.match(source, /labels\.retryDiagnostics/)
  assert.match(source, /labels\.retryDetail/)
  const controls = source.match(/<button[^>]*>[\s\S]*?<\/button>/g) || []
  assert.doesNotMatch(controls.join(' '), /approve|reject|resolve|replay|execute|repair|cancel|delete|edit|GitHub issue|pull request|trigger CI/i)
})
