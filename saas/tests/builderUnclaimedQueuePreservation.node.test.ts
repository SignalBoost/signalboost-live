import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8')

test('polling does not expire a queued Builder job that has never been claimed', () => {
  assert.match(source, /if \(!job \|\| job\.status === 'queued' \|\| !stale\(job\)\) return job/)
  assert.match(source, /await reconcileStaleBuilderJobs\(\{ userId, jobId \}\)/)
  assert.match(source, /const job = await readBuilderJob\(db, jobId, userId\)/)
})
