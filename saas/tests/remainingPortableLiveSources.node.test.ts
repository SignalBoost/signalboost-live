// saas/tests/remainingPortableLiveSources.node.test.ts
//
// Which portables have a live operational signal, and — for the ones that do not — that the
// absence is stated rather than papered over.
//
// This suite originally asserted the source map lived in the live route. It now asserts the
// opposite: the map belongs in lib/portable-products/live-activity.ts, in ONE place, because
// two maps produced two truths and a portable that looked connected while writing nothing.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  NO_LIVE_SOURCE_REASONS,
  PORTABLE_ACTIVITY_SOURCES,
  portablesWithUnexplainedSilence,
} from '../lib/portable-products/live-activity.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const route = () => hydrateLocalizedSource(readFileSync(new URL('../app/api/portable-products/live/route.ts', import.meta.url), 'utf8'))
const migration = () =>
  hydrateLocalizedSource(readFileSync(new URL('../supabase/migrations/20260725_portable_browser_activity.sql', import.meta.url), 'utf8'))
const adapter = () =>
  hydrateLocalizedSource(readFileSync(new URL('../lib/portable-browser/browser-activity-supabase.ts', import.meta.url), 'utf8'))

const tablesFor = (productId: string) => (PORTABLE_ACTIVITY_SOURCES[productId] ?? []).map((s) => s.table)

/** Drop comments so these checks read the CODE, not the prose describing it. */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Same idea for SQL. Both a `--` comment and a `comment on ... is '...'` statement may NAME
 * the things the table excludes — that is documentation, and it is the point. A COLUMN
 * definition may not.
 */
const sqlColumnsOnly = (sql: string) => sql.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''")

test('video maker uses its durable video job and artifact sources', () => {
  assert.deepEqual(tablesFor('video-maker'), ['video_jobs', 'video_storage'])
})

test('marketing and sales uses its portable department schema', () => {
  assert.deepEqual(tablesFor('marketing-sales'), [
    'ms_campaigns',
    'ms_drafts',
    'ms_publish_results',
    'ms_metrics',
    'ms_audit',
    'outreach_social_tokens',
    'outreach_social_destinations',
    'outreach_social_settings',
  ])
})

test('the browser activity table stays redacted and row-level secured', () => {
  const sql = migration()
  assert.match(sql, /create table if not exists public\.portable_browser_activity/)
  assert.match(sql, /enable row level security/)
  assert.doesNotMatch(sqlColumnsOnly(sql), /url|credential|screenshot|prompt|page_content|evidence\s+(text|jsonb)/i)
  const adapterSource = adapter()
  assert.match(adapterSource, /createBrowserActivitySink/)
  assert.match(adapterSource, /'supabase'/)
  assert.doesNotMatch(adapterSource, /process\.env|createClient|@supabase\/supabase-js/)
})

test('a table plus an adapter is NOT a live source while nothing calls the adapter', () => {
  // The table exists and the adapter exists — both asserted above. Neither is a signal,
  // because no caller exists, so the portable must NOT be reported as connected.
  assert.equal(PORTABLE_ACTIVITY_SOURCES['browser-agent-ecosystem'], undefined)
  assert.equal(PORTABLE_ACTIVITY_SOURCES['agent-operations-platform'], undefined)

  assert.match(NO_LIVE_SOURCE_REASONS['browser-agent-ecosystem'], /nothing anywhere calls the adapter/i)
  assert.match(NO_LIVE_SOURCE_REASONS['agent-operations-platform'], /needs a caller/i)
})

test('the source map lives in ONE place — the route declares no sources of its own', () => {
  const source = withoutComments(route())
  assert.doesNotMatch(source, /LIVE_SOURCE_OVERRIDES/)
  assert.doesNotMatch(source, /table: '/)
  // And it still cannot be pointed at an arbitrary table by a request.
  assert.doesNotMatch(source, /searchParams.*table|req.*table|request.*table/i)
})

test('no portable is silently silent — every one without a source states why', () => {
  const ids = [...Object.keys(PORTABLE_ACTIVITY_SOURCES), ...Object.keys(NO_LIVE_SOURCE_REASONS)]
  assert.deepEqual(portablesWithUnexplainedSilence(ids), [])
})
