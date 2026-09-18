import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const workflow = fs.readFileSync(path.join(ROOT, 'lib/ai/cos/cosUniversityMassDistillationWorkflow.ts'), 'utf8')

test('mass distillation workflow exposes enterprise teacher pool readiness', () => {
  assert.match(workflow, /import \{ universityTeacherPoolStatus \} from '\.\/cosUniversityTeacherPool\.ts'/)
  assert.match(workflow, /const teacherPool = universityTeacherPoolStatus\(\)/)
  assert.match(workflow, /teacherPool,/)
})
