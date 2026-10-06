import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sql = readFileSync(new URL('../supabase/migrations/20261006190000_mass_distillation_independent_source_admission.sql', import.meta.url), 'utf8')

test('rolling campaign authorization excludes synthetic and remediation from the independent half', () => {
  assert.match(sql, /create or replace function public\.authorize_next_cos_university_mass_distillation_campaign\(\)/)
  assert.match(sql, /cl\.source_kind not in\s*\(\s*'teacher_synthetic_curriculum', 'teacher_hosted_curriculum', 'failure_derived_curriculum'\s*\)/)
  assert.match(sql, /\) >= ceil\(b\.source_count \* 0\.5\)/)
  assert.match(sql, /b\.source_count between 64 and 128/)
  assert.match(sql, /for update skip locked/)
  assert.match(sql, /rolling_budget_exhausted/)
  assert.match(sql, /grant execute on function public\.authorize_next_cos_university_mass_distillation_campaign\(\) to service_role/)
})
