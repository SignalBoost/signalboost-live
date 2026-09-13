import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

test('one-time student training route authorizes one distillation job but never promotion', () => {
  const file = path.join(process.cwd(), 'app/api/internal/cos/university-student-training/dispatch-once/route.ts')
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /dispatchApprovedOneTimeStudentTraining/)
  assert.match(source, /automaticPromotionAuthorized:\s*false/)
  assert.doesNotMatch(source, /promote|promotion.*true/i)
})
