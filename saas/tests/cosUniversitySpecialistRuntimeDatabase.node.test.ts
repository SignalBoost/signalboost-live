// saas/tests/cosUniversitySpecialistRuntimeDatabase.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  UNIVERSITY_SPECIALIST_ROLES,
  universitySpecialistRuntime,
} from '../lib/ai/cos/cosUniversitySpecialistRuntimes.ts'

const read = (relative: string) => fs.readFileSync(path.resolve(import.meta.dirname, '..', relative), 'utf8')
const binding = read('supabase/migrations/20260913201500_university_specialist_runtime_binding.sql')
const practice = read('supabase/migrations/20260913201600_university_specialist_practice_binding.sql')

test('database role-to-runtime mapping is exactly the application mapping', () => {
  assert.match(binding, /create or replace function public\.cos_university_specialist_runtime_for_role/)
  for (const role of UNIVERSITY_SPECIALIST_ROLES) {
    const runtime = universitySpecialistRuntime(role)
    assert.ok(runtime, `${role} has no application runtime`)
    assert.ok(binding.includes(`when '${role}' then '${runtime}'`), `${role} database runtime mapping drifted`)
  }
  assert.match(binding, /else null/)
})

test('all five graded execution ledgers replace the software-only constraint with strict role/runtime binding', () => {
  for (const [table, oldConstraint, newConstraint] of [
    ['cos_university_generalist_capstone_runs', 'cos_university_capstone_execution_binding_v1', 'cos_university_capstone_execution_binding_v2'],
    ['cos_university_exam_runs', 'cos_university_exam_execution_binding_v1', 'cos_university_exam_execution_binding_v2'],
    ['cos_university_a_range_runs', 'cos_university_a_range_execution_binding_v1', 'cos_university_a_range_execution_binding_v2'],
    ['cos_university_retention_runs', 'cos_university_retention_execution_binding_v1', 'cos_university_retention_execution_binding_v2'],
    ['cos_university_masters_exam_runs', 'cos_university_masters_execution_binding_v1', 'cos_university_masters_execution_binding_v2'],
  ] as const) {
    assert.ok(binding.includes(`alter table public.${table}`), `${table} not migrated`)
    assert.ok(binding.includes(`drop constraint if exists ${oldConstraint}`), `${oldConstraint} not retired`)
    assert.ok(binding.includes(`add constraint ${newConstraint}`), `${newConstraint} not installed`)
  }
  assert.match(binding, /execution_provenance->>'runtime' = public\.cos_university_specialist_runtime_for_role\(execution_provenance->>'role'\)/)
  assert.ok((binding.match(/response_source = execution_provenance->>'runtime'/g) || []).length >= 4)
  assert.ok((binding.match(/not valid;/g) || []).length >= 5, 'historical rows must not be retroactively granted or revoked credit')
})

test('atomic practice recorder binds the registered learner to the same runtime map', () => {
  assert.match(practice, /registered_runtime := public\.cos_university_specialist_runtime_for_role\(registered_role\)/)
  assert.match(practice, /execution->>'runtime' = registered_runtime/)
  assert.match(practice, /execution->>'role' = registered_role/)
  assert.match(practice, /p_evidence->>'responseSource' = registered_runtime/)
  assert.doesNotMatch(practice, /registered_role is distinct from 'software_engineering'/)
  assert.match(practice, /grant execute on function public\.cos_record_cognitive_practice_result[\s\S]*to service_role/)
  assert.match(practice, /academicCredit' = 'false'::jsonb/)
})
