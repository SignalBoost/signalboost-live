import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = () => readFileSync(new URL('../app/api/portable-products/live/route.ts', import.meta.url), 'utf8')
const migration = () => readFileSync(new URL('../supabase/migrations/20260725_portable_browser_activity.sql', import.meta.url), 'utf8')
const adapter = () => readFileSync(new URL('../lib/portable-browser/browser-activity-supabase.ts', import.meta.url), 'utf8')

test('video maker uses existing durable video job and artifact sources', () => {
  const source = route()
  assert.match(source, /'video-maker'/)
  assert.match(source, /table: 'video_jobs'/)
  assert.match(source, /table: 'video_storage'/)
})

test('marketing and sales uses its portable department schema', () => {
  const source = route()
  for (const table of ['ms_campaigns', 'ms_drafts', 'ms_publish_results', 'ms_metrics', 'ms_audit']) {
    assert.match(source, new RegExp(`table: '${table}'`))
  }
})

test('browser ecosystem has a redacted durable activity source', () => {
  assert.match(route(), /table: 'portable_browser_activity'/)
  const sql = migration()
  assert.match(sql, /create table if not exists public\.portable_browser_activity/)
  assert.match(sql, /enable row level security/)
  assert.doesNotMatch(sql, /url|credential|screenshot|prompt|page_content|evidence\s+(text|jsonb)/i)
  assert.match(adapter(), /from\('portable_browser_activity'\)\.insert/)
})

test('live source overrides remain fixed and request-independent', () => {
  const source = route()
  assert.match(source, /const LIVE_SOURCE_OVERRIDES/)
  assert.doesNotMatch(source, /searchParams.*table|req.*table|request.*table/i)
})
