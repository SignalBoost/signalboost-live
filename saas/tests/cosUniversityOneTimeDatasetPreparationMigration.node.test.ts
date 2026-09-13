import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

test('one-time dataset preparation migration hard-caps cost and forbids training', () => {
  const file = path.join(process.cwd(), 'supabase/migrations/20260913232500_cos_university_one_time_dataset_preparation.sql')
  const sql = fs.readFileSync(file, 'utf8')
  assert.match(sql, /max_hourly_cost_usd <= 0\.050000/)
  assert.match(sql, /max_estimated_cost_usd <= 0\.015000/)
  assert.match(sql, /student_training_authorized = false/)
  assert.match(sql, /operation = 'prepare_dataset'/)
})
