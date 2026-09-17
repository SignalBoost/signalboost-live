import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const doc = fs.readFileSync(path.join(ROOT, 'docs/university-teacher-pool-status.md'), 'utf8')

test('teacher rollout status keeps evaluation provider-independent', () => {
  assert.match(doc, /Independent evaluation and graduation criteria remain provider-independent/)
  assert.match(doc, /Unknown licenses fail closed/)
})
