import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('repair replan preserves original customer objective on canonical task admission', () => {
  const job = readFileSync('lib/builder/repository-repair-job.ts', 'utf8')
  assert.match(job, /const objective = input\.objective/)
  assert.match(job, /const executionObjective = replan\?\.objective \?\? objective/)
  assert.match(job, /await workspace\.setObjective\(workspaceId, executionObjective\)/)
  assert.match(job, /repairExecutionObjective: executionObjective/)
  assert.match(job, /enqueueBuilderJob\(\{[\s\S]*?\n    objective,/)
})
test('verified execution target may change without mutating the customer objective', () => {
  const runner = readFileSync('lib/builder/job-runner.ts', 'utf8')
  assert.match(runner, /job\.metadata\.platformRepair === true && typeof job\.metadata\.repairExecutionObjective === 'string'/)
  assert.match(runner, /rawObjective: job\.objective/)
})
