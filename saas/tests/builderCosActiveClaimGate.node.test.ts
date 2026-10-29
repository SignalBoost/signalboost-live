import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('Builder continuation active claim gate excludes COS tasks', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/cron/builder-continuations/route.ts'), 'utf8')
  const start = route.indexOf('const { count: activeRunningClaims')
  const end = route.indexOf('if (activeClaimsError)', start)
  assert.ok(start >= 0 && end > start)
  assert.match(route.slice(start, end), /\.eq\('status', 'running'\)\.eq\('job_kind', 'standard'\)/)
})
