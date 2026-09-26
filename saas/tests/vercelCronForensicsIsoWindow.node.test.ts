import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('Vercel cron forensics sends documented ISO-8601 event windows', async () => {
  const route = await readFile(new URL('../app/api/cron/vercel-cron-forensics/route.ts', import.meta.url), 'utf8')
  assert.match(route, /url\.searchParams\.set\('since', start\)/)
  assert.match(route, /url\.searchParams\.set\('until', end\)/)
  assert.doesNotMatch(route, /String\(Date\.parse\(start\)\)/)
  assert.doesNotMatch(route, /String\(Date\.parse\(end\)\)/)
})
