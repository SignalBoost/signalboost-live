import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/api/cron/builder-continuations/route.ts', import.meta.url), 'utf8')

test('scheduled Builder continuation checks durable active claims before selecting another job', () => {
  const query = source.indexOf("const { count: activeRunningClaims")
  const selected = source.indexOf('const selected = blockedByActiveClaim')
  const launch = source.indexOf('await runBuilderJob(selected.id, selected.userId)')
  assert.ok(query > 0 && selected > query && launch > selected)
  assert.match(source, /\.eq\('status', 'running'\)/)
  assert.match(source, /blockedByActiveClaim = \(activeRunningClaims \?\? 0\) > 0/)
  assert.match(source, /activeClaimsError[\s\S]*builder_continuation_admission_unavailable/)
  assert.match(source, /admissionDeferred: blockedByActiveClaim && jobs\.length > 0/)
  assert.match(source, /This admission check[\s\S]*is not an atomic global lease/)
})
