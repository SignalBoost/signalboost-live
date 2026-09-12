// saas/tests/cosUniversityReceiptHonesty.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { batchExecutedNothing } from '../lib/ai/cos/cosUniversityDailyLaneCadenceCore.ts'

const recorder = fs.readFileSync(
  path.join(process.cwd(), 'lib/ai/cos/cosUniversityProductionAssurance.ts'), 'utf8')
const cronDir = path.join(process.cwd(), 'app/api/cron')

test('the recorder downgrades a claimed success when the batch examined nothing', () => {
  assert.match(recorder, /const examinedNothing = batchExecutedNothing\(suppliedEvidence\)/)
  assert.match(recorder, /invocationSucceeded: input\.invocationSucceeded && !examinedNothing/)
  assert.match(recorder, /invocationDowngraded: 'all_runs_ended_in_error'/)
})

test('the downgrade is central, so no lane can report success without passing it', () => {
  // Nine cron routes each compute invocationSucceeded from their runner's errors array. The runners
  // record an execution failure as a run with status 'error' and return rather than throw, so that
  // array is empty and every one of them would claim success. One check covers all of them.
  const lanes = fs.readdirSync(cronDir).filter(name => name.startsWith('cos-university-'))
  const claiming = lanes.filter(lane => {
    const route = path.join(cronDir, lane, 'route.ts')
    return fs.existsSync(route) && /invocationSucceeded:\s*result\.[a-zA-Z]*[eE]rrors/.test(fs.readFileSync(route, 'utf8'))
  })
  assert.ok(claiming.length >= 3, `expected several lanes computing success from errors, found ${claiming.length}`)
  assert.match(recorder, /recordCosUniversityProductionPath/)
})

test('the 2026-09-11 07:00 exam batch would now be recorded as an unsuccessful invocation', () => {
  const evidence = {
    attempted: 0, passed: 0, failed: 0, errors: [],
    runs: [
      { status: 'error', reasons: ['execution_error:localEmbeddings: HTTP 402'] },
      { status: 'error', reasons: ['execution_error:localEmbeddings: HTTP 402'] },
    ],
  }
  assert.equal(batchExecutedNothing(evidence), true)
  assert.equal(true && !batchExecutedNothing(evidence), false, 'a claimed success is downgraded')
})

test('honest receipts are untouched: real runs, failed exams, and no-run lanes all keep their claim', () => {
  assert.equal(batchExecutedNothing({ runs: [{ status: 'failed' }] }), false, 'a failed exam is an outcome')
  assert.equal(batchExecutedNothing({ runs: [{ status: 'error' }, { status: 'passed' }] }), false)
  assert.equal(batchExecutedNothing({ dailyCadence: 'not_due', runnerInvoked: false }), false)
  assert.equal(batchExecutedNothing({ skipped: true }), false)
  assert.equal(batchExecutedNothing({ runs: [] }), false)
})

test('the downgrade cannot turn a genuine failure into a success', () => {
  for (const evidence of [{ runs: [{ status: 'error' }] }, { runs: [{ status: 'passed' }] }, {}]) {
    assert.equal(false && !batchExecutedNothing(evidence), false)
  }
})
