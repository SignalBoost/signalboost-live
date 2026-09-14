import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20260914194700_owner_directed_unique_material_admission.sql', import.meta.url), 'utf8')
const store = readFileSync(new URL('../lib/ai/cos/directedStudyStore.ts', import.meta.url), 'utf8')

test('owner-directed exact retained material is deduped independently of source URI', () => {
  assert.match(migration, /where evidence @> '\["owner_directed_study"\]'::jsonb/)
  assert.match(migration, /lower\(btrim\(regexp_replace\(coalesce\(subject,''\)/)
  assert.match(migration, /md5\(lower\(btrim\(regexp_replace\(coalesce\(summary,''\)/)
  assert.match(migration, /existing\.content_hash <> new\.content_hash/)
  assert.match(migration, /message = 'duplicate owner-directed retained material'/)
})

test('directed-study duplicate admission uses the existing application duplicate contract', () => {
  assert.match(migration, /errcode = '23505'/)
  assert.match(store, /String\(write\.error\.code \|\| ''\) === '23505'/)
  assert.match(store, /result\.duplicates \+= 1/)
  assert.match(migration, /before insert on public\.cos_continuous_learning/)
})

test('dedupe guard preserves historical rows and non-directed continuous learning', () => {
  assert.doesNotMatch(migration, /delete from public\.cos_continuous_learning/i)
  assert.doesNotMatch(migration, /update public\.cos_continuous_learning/i)
  assert.match(migration, /if not \(coalesce\(new\.evidence, '\[\]'::jsonb\) @> '\["owner_directed_study"\]'::jsonb\) then[\s\S]*return new/)
  assert.match(migration, /pg_catalog\.length\(v_summary\) < 200/)
})
