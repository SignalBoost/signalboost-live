import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (name: string) => readFileSync(new URL('../lib/builder/' + name, import.meta.url), 'utf8')
test('repository repair stores the unchanged customer objective and separate execution plan', () => {
  const source = read('repository-repair-job.ts')
  assert.match(source, /const objective = input\.objective/)
  assert.match(source, /const executionObjective = replan\?\.objective \?\? objective/)
  assert.match(source, /setObjective\(workspaceId, executionObjective\)/)
  assert.match(source, /enqueueBuilderJob\(\{[\s\S]*?\n    objective,\n/)
  assert.match(source, /\.\.\.\(replan \? \{ executionObjective \} : \{\}\)/)
})
test('V2 lease selects revisioned execution instructions without rewriting the stored objective', () => {
  const source = read('agent-v2-supabase-store.ts')
  assert.match(source, /data\.metadata\?\.platformRepair === true/)
  assert.match(source, /typeof data\.metadata\?\.executionObjective === 'string'/)
  assert.match(source, /: String\(data\.objective\)/)
})
test.todo('PostgreSQL integration: immutable objective survives stale-head replan and a worker restart')
