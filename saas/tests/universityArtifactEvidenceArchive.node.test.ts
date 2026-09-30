import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/20260930080000_university_artifact_evidence_archive.sql', import.meta.url), 'utf8')

test('completed University artifacts are copied to a durable evidence archive without deleting source evidence', () => {
  assert.match(sql, /create table if not exists public\.cos_university_artifact_evidence_archive/)
  assert.match(sql, /disposition in \('graduated','retired'\)/)
  assert.match(sql, /source_snapshot jsonb not null/)
  assert.match(sql, /after insert or update of status, intended_use, updated_at/)
  assert.match(sql, /when \(new\.status in \('active','retired'\)\)/)
  assert.match(sql, /where a\.status in \('active','retired'\)/)
  assert.doesNotMatch(sql, /delete\s+from\s+public\.cos_local_distillation_artifacts/i)
})

test('buyer reporting view retains independent evaluation gates', () => {
  assert.match(sql, /create or replace view public\.cos_university_artifact_evidence_report/)
  assert.match(sql, /baseline_score/)
  assert.match(sql, /trained_artifact_score/)
  assert.match(sql, /holdout_improved/)
  assert.match(sql, /safety_passed/)
  assert.match(sql, /unseen_transfer_passed/)
  assert.match(sql, /delayed_retention_passed/)
  assert.match(sql, /cos_university_graduate_model_registry/)
})
