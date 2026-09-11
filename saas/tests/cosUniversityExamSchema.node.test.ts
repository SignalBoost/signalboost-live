import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { isSoftwareCapstoneIdentity, SOFTWARE_CAPSTONE_ROLE } from '../lib/ai/cos/cosUniversityAgentCapstone.ts'

const migration = fs.readFileSync(path.resolve(import.meta.dirname,
  '../supabase/migrations/20260911235500_university_agent_exam_execution.sql'), 'utf8')

const legacyKeyPattern = '^cos_university_unseen_v1:[0-9]{4}-[0-9]{2}-[0-9]{2}:(subject:[a-z_]+|language:(en|es|pt|pl|ru):[a-z_]+)$'

test('exam provenance migration defines generated ownership before using agent_id', () => {
  const owner = migration.indexOf('ADD COLUMN IF NOT EXISTS agent_id text')
  const binding = migration.indexOf('ADD CONSTRAINT cos_university_exam_execution_binding_v1')
  assert.ok(owner >= 0 && owner < binding, 'the base exam table has no agent_id column')
  assert.match(migration.slice(owner, binding), /GENERATED ALWAYS AS[\s\S]*split_part\(run_key, ':', 2\)[\s\S]*STORED/)
  assert.doesNotMatch(migration, /agent_id\s+text\s+DEFAULT\s+'cos'/i)
})

test('exam provenance migration recognizes only explicit agent keys or the legacy COS key format', () => {
  assert.match(migration, /split_part\(run_key, ':', 1\) = profile/)
  assert.ok(migration.includes(legacyKeyPattern))
  assert.match(migration, /ELSE NULL\s+END/)
  assert.match(migration, /ADD CONSTRAINT cos_university_exam_run_identity_v1 CHECK \(agent_id IS NOT NULL\) NOT VALID/)
})

test('exam ownership uses the bound executor identity grammar, including numeric prefixes and length limits', () => {
  const match = /split_part\(run_key, ':', 2\) ~ '([^']+)'/.exec(migration)
  assert.ok(match, 'generated ownership must validate the agent segment')
  const identity = new RegExp(match[1])
  const cases = ['cos', 'software-specialist', '2d-specialist', '7', '2026-09-11',
    `2${'a'.repeat(179)}`, 'a'.repeat(181), '', '-worker', '_worker', 'UpperCase', 'with space', 'bad:id']
  for (const agentId of cases) {
    assert.equal(identity.test(agentId), agentId === 'cos' || isSoftwareCapstoneIdentity(agentId, SOFTWARE_CAPSTONE_ROLE), agentId)
  }
})

test('legacy COS keys are recognized before digit-leading explicit agent IDs', () => {
  const legacy = migration.indexOf("WHEN profile = 'cos_university_unseen_v1'")
  const explicit = migration.indexOf("WHEN split_part(run_key, ':', 1) = profile")
  assert.ok(legacy >= 0 && explicit > legacy, 'a legacy date must not become an agent ID')
  assert.match(migration.slice(legacy, explicit), /THEN 'cos'/)
  const pattern = new RegExp(legacyKeyPattern)
  assert.equal(pattern.test('cos_university_unseen_v1:2026-09-11:subject:computer_science'), true)
  assert.equal(pattern.test('cos_university_unseen_v1:2026-09-11:language:pt:comprehension'), true)
  assert.equal(pattern.test('cos_university_unseen_v1:2026-09-11:2026-09-12:subject:computer_science'), false)
})

test('explicit exam ownership requires the generator daily or remediation scope', () => {
  assert.ok(migration.includes("split_part(run_key, ':', 3) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'"))
  assert.match(migration, /OR split_part\(run_key, ':', 3\) = 'remediation'/)
  assert.doesNotMatch(migration, /split_part\(run_key, ':', 3\) <> ''/)
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
