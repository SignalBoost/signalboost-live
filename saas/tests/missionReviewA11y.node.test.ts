import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = () => readFileSync(new URL('../app/dashboard/supervisor/missions/reviews/MissionReviewClient.tsx', import.meta.url), 'utf8')

test('Mission Review exposes an accessible, keyboard-native detail control', () => {
  const source = client()
  assert.match(source, /<button type="button" aria-label=\{`\$\{labels\.openDetail\}: \$\{review\.reviewId\}`\}/)
  assert.match(source, /onClick=\{event => void openDetail\(review\.reviewId, event\.currentTarget\)\}/)
  assert.doesNotMatch(source, /<tr[^>]*(onClick|tabIndex|onKeyDown)/)
})

test('Mission Review announces loading, errors, empty results, and bounded copy feedback', () => {
  const source = client()
  assert.match(source, /role="status">\{labels\.loading\}/)
  assert.match(source, /role="alert">\{error\}/)
  assert.match(source, /role="status">\{labels\.empty\}/)
  assert.match(source, /role="status" aria-live="polite" aria-atomic="true"/)
  assert.match(source, /setCopyFeedback\(labels\.fingerprintCopied\)/)
  assert.match(source, /setTimeout\(\(\) => setCopyFeedback\(''\), 3000\)/)
})

test('Mission Review supports Escape close, focus restoration, and visible focus styling', () => {
  const source = client()
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /detailOpener\.current\?\.focus\(\)/)
  assert.match(source, /:focus-visible/)
})
