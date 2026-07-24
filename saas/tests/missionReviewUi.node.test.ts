import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const page = () => read('../app/dashboard/supervisor/missions/reviews/page.tsx')
const client = () => read('../app/dashboard/supervisor/missions/reviews/MissionReviewClient.tsx')

test('Mission 002 review page authenticates and rejects unauthorized users', () => {
  const source = page()
  assert.match(source, /getCurrentUser\(\)/)
  assert.match(source, /redirect\('\/login'\)/)
  assert.match(source, /access\.isAdmin/)
  assert.match(source, /labels\.accessDenied/)
})

test('review UI has loading, empty, and bounded API error states', () => {
  const source = client()
  for (const label of ['labels.loading', 'labels.empty', 'labels.error', 'labels.notFound']) assert.match(source, new RegExp(label.replace('.', '\\.')))
  assert.match(source, /role="status"/)
  assert.match(source, /role="alert"/)
  assert.match(source, /messageFor/)
  assert.match(source, /aria-atomic="true"/)
})

test('review UI uses native detail buttons with accessible filter and pagination labels', () => {
  const source = client()
  assert.match(source, /<button type="button" aria-label=\{`\$\{labels\.openDetail\}: \$\{review\.reviewId\}`\}/)
  assert.match(source, /<form onSubmit=\{applyFilters\} style=\{filters\} aria-label=\{labels\.filters\}>/)
  assert.match(source, /<nav style=\{pagination\} aria-label=\{labels\.pagination\}>/)
  assert.match(source, /focus-visible/)
  assert.doesNotMatch(source, /<tr[^>]*(onClick|tabIndex|onKeyDown)/)
})

test('detail panel closes on Escape and restores focus to its opener', () => {
  const source = client()
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /event\.preventDefault\(\); closeDetail\(\)/)
  assert.match(source, /detailOpener\.current\?\.focus\(\)/)
  assert.match(source, /<button type="button" onClick=\{closeDetail\}>\{labels\.closeDetail\}<\/button>/)
})

test('review UI renders only list allowlist and keeps fingerprints out of list rows', () => {
  const source = client()
  const listSection = source.slice(source.indexOf('<table'), source.indexOf('</table>') + 8)
  for (const field of ['reviewId', 'missionId', 'missionRevision', 'decisionId', 'status', 'title', 'summary', 'createdAt', 'routedAt']) assert.match(listSection, new RegExp(`review\\.${field}`))
  assert.doesNotMatch(listSection, /Fingerprint/)
})

test('review UI supports status and mission filters with bounded page size', () => {
  const source = client()
  assert.match(source, /params\.set\('status', status\)/)
  assert.match(source, /params\.set\('missionId', missionId\.trim\(\)\)/)
  assert.match(source, /const sizes = \[25, 50, 100\]/)
  assert.match(source, /Math\.min\(100, pageSize\)/)
  assert.match(source, /setPageSize\(Math\.min\(100/)
})

test('review UI uses cursor previous and next pagination', () => {
  const source = client()
  assert.match(source, /params\.set\('cursor', activeCursor\)/)
  assert.match(source, /function nextPage\(\)/)
  assert.match(source, /function previousPage\(\)/)
  assert.match(source, /setHistory\(previous => \[\.\.\.previous, cursor \|\| ''\]\)/)
})

test('detail rendering includes fingerprints and bounded mission summary only', () => {
  const source = client()
  for (const field of ['decisionFingerprint', 'planFingerprint', 'bindingFingerprint']) assert.match(source, new RegExp(`detail\\.${field}`))
  assert.match(source, /<code>\{value\}<\/code>/)
  assert.match(source, /navigator\.clipboard/)
  assert.match(source, /detail\.mission/)
  assert.match(source, /labels\.feedbackUnavailable/)
})

test('review UI makes GET-only Phase 6 requests and exposes no mutation controls', () => {
  const source = client()
  assert.match(source, /\/api\/internal\/supervisor\/missions\/reviews\?\$\{params\}/)
  assert.match(source, /\/api\/internal\/supervisor\/missions\/reviews\/\$\{encodeURIComponent\(reviewId\)\}/)
  assert.equal((source.match(/method: 'GET'/g) || []).length, 3)
  assert.doesNotMatch(source, /method:\s*'(POST|PUT|PATCH|DELETE)'/)
  const controls = source.match(/<button[^>]*>[\s\S]*?<\/button>/g) || []
  assert.equal(controls.length, 6)
  assert.doesNotMatch(controls.join(' '), /approve|reject|resolve|retry|replay|execute|repair|cancel|delete|edit|GitHub issue|pull request|trigger CI/i)
  assert.doesNotMatch(source, /supabase|authorization|credentials|cookies/i)
})

test('required safety labels are visible and localized in all supported languages', () => {
  const source = client(); const locales = JSON.parse(read('../lib/i18n/supervisorSocLocales.json'))
  for (const key of ['manualReviewOnly', 'noRepair', 'productionDisabled', 'providerDisabled']) assert.match(source, new RegExp(`labels\\.${key}`))
  for (const lang of ['en', 'pt', 'es', 'pl', 'ru']) for (const key of ['title', 'manualReviewOnly', 'noRepair', 'productionDisabled', 'providerDisabled', 'loading', 'empty', 'error', 'openDetail', 'closeDetail', 'pagination', 'fingerprintCopied', 'fingerprintCopyFailed']) assert.ok(locales[lang].missionReviewUi[key], `${lang}.${key}`)
})
