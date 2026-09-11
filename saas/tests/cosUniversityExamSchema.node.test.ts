import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = fs.readFileSync(path.resolve(import.meta.dirname,
  '../supabase/migrations/20260911235500_university_agent_exam_execution.sql'), 'utf8')

test('exam provenance migration defines generated ownership before using agent_id', () => {
  const owner = migration.indexOf('ADD COLUMN IF NOT EXISTS agent_id text')
  const binding = migration.indexOf('ADD CONSTRAINT cos_university_exam_execution_binding_v1')
  assert.ok(owner >= 0 && owner < binding, 'the base exam table has no agent_id column')
  assert.match(migration.slice(owner, binding), /GENERATED ALWAYS AS[\s\S]*split_part\(run_key, ':', 2\)[\s\S]*STORED/)
  assert.doesNotMatch(migration, /agent_id\s+text\s+DEFAULT\s+'cos'/i)
})

test('exam provenance migration recognizes only explicit agent keys or the legacy COS key format', () => {
  assert.match(migration, /split_part\(run_key, ':', 1\) = profile/)
  assert.match(migration, /\^\[a-z\]\[a-z0-9_-\]\*\$/)
  assert.ok(migration.includes("^cos_university_unseen_v1:[0-9]{4}-[0-9]{2}-[0-9]{2}:(subject:[a-z_]+|language:(en|es|pt|pl|ru):[a-z_]+)$"))
  assert.match(migration, /THEN 'cos'\s+ELSE NULL/)
  assert.match(migration, /ADD CONSTRAINT cos_university_exam_run_identity_v1 CHECK \(agent_id IS NOT NULL\) NOT VALID/)
})

test('exam provenance migration retains host-owned binding and never rewrites academic evidence', () => {
  for (const key of ['agentId', 'runId', 'turnId', 'manifestHash', 'promptHash', 'responseHash', 'contextHash']) {
    assert.ok(migration.includes(`execution_provenance->>'${key}'`), `${key} must stay bound`)
  }
  assert.match(migration, /\) IS TRUE/)
  assert.match(migration, /NOT VALID/)
  const executable = migration.replace(/--[^\n]*/g, '')
  assert.doesNotMatch(executable, /\b(UPDATE|DELETE|INSERT|GRANT|REVOKE|DISABLE|DROP)\b/i)
  assert.doesNotMatch(executable, /cos_university_(assessments|credentials|study_plans|program_enrollments)/)
})
