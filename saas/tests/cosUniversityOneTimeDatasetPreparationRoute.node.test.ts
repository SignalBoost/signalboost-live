import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

test('one-time dataset preparation route cannot authorize student training', () => {
  const file = path.join(process.cwd(), 'app/api/internal/cos/university-dataset-preparation/dispatch-once/route.ts')
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /studentTrainingAuthorized:\s*false/)
  assert.doesNotMatch(source, /operation:\s*['"]train['"]/)
})
