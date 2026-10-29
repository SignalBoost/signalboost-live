import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('COS turn status derives from worker outcome instead of reply wording', () => {
  const source = readFileSync(new URL('../app/api/cos-provenance-browser/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /refusedRequestedExecution|cos_execution_refused/)
  assert.match(source, /workerResponse\.ok && payload\?\.ok !== false && Boolean\(reply\)/)
})
test('no uncalled queued-only Builder plan mutator remains', () => {
  const source = readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /advanceBuilderRepairPlanVersion/)
})
