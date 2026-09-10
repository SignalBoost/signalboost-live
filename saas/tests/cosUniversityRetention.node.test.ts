import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { COS_UNIVERSITY_RETENTION_MIN_DELAY_DAYS, selectDueCosUniversityRetention } from '../lib/ai/cos/cosUniversityRetention.ts'

test('retention is delayed, replays a passed transfer, and never reuses completed evidence', () => {
  const now = new Date('2026-09-30T00:00:00Z')
  const source = { id: 'run-1', subjectId: 'cybersecurity' as const, seed: 'seed', manifestHash: 'hash', passed: true, observedAt: '2026-09-15T00:00:00Z' }
  assert.equal(COS_UNIVERSITY_RETENTION_MIN_DELAY_DAYS, 14)
  assert.equal(selectDueCosUniversityRetention([source], new Set(), now)?.id, 'run-1')
  assert.equal(selectDueCosUniversityRetention([{ ...source, observedAt: '2026-09-20T00:00:00Z' }], new Set(), now), null)
  assert.equal(selectDueCosUniversityRetention([source], new Set(['run-1']), now), null)
  assert.equal(selectDueCosUniversityRetention([{ ...source, passed: false }], new Set(), now), null)
})

test('retention schema is service-only and stores no prompt, rubric, or reply', () => {
  const sql = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/migrations/20260910133000_cos_university_delayed_retention.sql'), 'utf8')
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /revoke all .* from anon, authenticated/i)
  assert.doesNotMatch(sql, /\bprompt\s+text\b|\brubric\s+jsonb\b|\breply\s+text\b/i)
})
