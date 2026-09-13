import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

test('one-time student training migration binds distillation, T4 Small, and hard cost caps', () => {
  const file = path.join(process.cwd(), 'supabase/migrations/20260913234500_cos_university_one_time_student_training.sql')
  const sql = fs.readFileSync(file, 'utf8')
  assert.match(sql, /training_mode = 'distillation'/)
  assert.match(sql, /required_flavor = 't4-small'/)
  assert.match(sql, /max_hourly_cost_usd <= 0\.410000/)
  assert.match(sql, /max_estimated_cost_usd <= 1\.610000/)
  assert.match(sql, /automatic_promotion_authorized = false/)
  assert.match(sql, /authority_expanded = false/)
})
