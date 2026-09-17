import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260917154800_terminal_failed_campaigns_do_not_block_rolling.sql'),
  'utf8',
)

test('terminalized failed campaigns do not block rolling authorization', () => {
  assert.match(migration, /c\.status='failed' and c\.completed_at is null/)
  assert.match(migration, /c\.status in \('authorized','active'\)/)
  assert.doesNotMatch(migration, /c\.status in \('authorized','active','failed'\)/)
})

test('repair remains lifecycle-only and does not widen operational authority', () => {
  assert.match(migration, /does not expand provider spend, retry, promotion/)
  assert.doesNotMatch(migration, /automatic_promotion_authorized\s*=\s*true/i)
  assert.doesNotMatch(migration, /runpod_mutation_authorized\s*=\s*true/i)
})
