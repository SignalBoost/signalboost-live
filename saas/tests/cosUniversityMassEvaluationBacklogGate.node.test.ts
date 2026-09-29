// saas/tests/cosUniversityMassEvaluationBacklogGate.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MASS_EVALUATION_BACKLOG_DEFAULT_LIMIT,
  MASS_EVALUATION_BACKLOG_MAX_LIMIT,
  MASS_EVALUATION_BACKLOG_XSA_RECEIPT_PATH,
  massEvaluationBacklogDecision,
  massEvaluationBacklogLimit,
  readMassEvaluationBacklogGate,
} from '../lib/ai/cos/cosUniversityMassEvaluationBacklogGate.ts'
import { MASS_XSA_EXAMS_PAUSED } from '../lib/ai/cos/cosUniversityXsaExamPause.ts'

type Result = { count?: number | null; error?: { message?: string } | null } | Error

/**
 * The gate now issues up to two counts: the whole waiting queue, then the exam-paused subset it must not
 * charge training for. `results` is consumed in order, so a test can make the first succeed and the second
 * fail. `eq` is chainable because the second query adds a receipt-path filter before `like` terminates it.
 */
function fakeDb(...results: Result[]) {
  const calls: string[] = []
  let index = 0
  const next = (): Promise<any> => {
    const result = results[Math.min(index++, results.length - 1)]
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
  }
  const query = (): any => ({
    eq(column: string, value: string) {
      calls.push(`eq:${column}=${value}`)
      return query()
    },
    like(column: string, pattern: string) {
      calls.push(`like:${column}=${pattern}`)
      return next()
    },
  })
  return {
    calls,
    db: {
      from(table: string) {
        calls.push(`from:${table}`)
        return {
          select(columns: string, options: { count: 'exact'; head: true }) {
            calls.push(`select:${columns}:${options.count}:${options.head}`)
            return query()
          },
        }
      },
    },
  }
}

test('the Production incident shape pauses new paid training', () => {
  const gate = massEvaluationBacklogDecision({ pendingEvaluation: 1118, limit: 48 })
  assert.equal(gate.open, false)
  assert.equal(gate.reason, 'evaluation_backlog_full')
  assert.equal(gate.ok, true)
  assert.equal(gate.authorityExpanded, false)
})

test('training resumes automatically once the backlog drains below the limit', () => {
  assert.equal(massEvaluationBacklogDecision({ pendingEvaluation: 47, limit: 48 }).open, true)
  assert.equal(massEvaluationBacklogDecision({ pendingEvaluation: 48, limit: 48 }).open, false)
  assert.equal(massEvaluationBacklogDecision({ pendingEvaluation: 0, limit: 48 }).open, true)
})

test('an unreadable backlog fails closed for new spend only', async () => {
  for (const input of [
    fakeDb({ count: null, error: { message: 'timeout' } }),
    fakeDb(new Error('network')),
    fakeDb({ count: null, error: null }),
  ]) {
    const gate = await readMassEvaluationBacklogGate({ db: input.db as any, env: {} })
    assert.equal(gate.open, false)
    assert.equal(gate.reason, 'evaluation_backlog_unreadable')
    assert.equal(gate.ok, true)
  }
  const missing = await readMassEvaluationBacklogGate({ db: null, env: {} })
  assert.equal(missing.open, false)
})

test('the live read counts only mass artifacts waiting for independent evaluation', async () => {
  const input = fakeDb({ count: 12, error: null }, { count: 0, error: null })
  const gate = await readMassEvaluationBacklogGate({ db: input.db as any, env: {} })
  assert.equal(gate.open, true)
  assert.equal(gate.pendingEvaluation, 12)
  assert.equal(gate.examPausedExcluded, 0)
  assert.deepEqual(input.calls.slice(0, 4), [
    'from:cos_local_distillation_artifacts',
    'select:candidate_id:exact:true',
    'eq:status=evaluation_pending',
    'like:candidate_id=mass:%',
  ])
})

// Production 2026-09-29: 61 waiting against a limit of 48, of which 47 were XSA students the exam lane is
// forbidden to take. Counting them turned a deliberate exam pause into a permanent training freeze, because a
// paused student never drains. 61 - 47 = 14, which is under the limit and is the real downstream load.
test('students the exam lane is forbidden to take do not hold training closed', async () => {
  assert.equal(MASS_XSA_EXAMS_PAUSED, true, 'this exclusion only applies while XSA exams are paused')
  const input = fakeDb({ count: 61, error: null }, { count: 47, error: null })
  const gate = await readMassEvaluationBacklogGate({ db: input.db as any, env: {} })
  assert.equal(gate.pendingEvaluation, 14)
  assert.equal(gate.examPausedExcluded, 47)
  assert.equal(gate.open, true)
  assert.equal(gate.reason, 'evaluation_backlog_below_limit')

  // The exclusion must be read with the same receipt path the evaluator uses to identify an XSA student,
  // and must still be scoped to waiting mass artifacts.
  assert.ok(input.calls.includes(`eq:${MASS_EVALUATION_BACKLOG_XSA_RECEIPT_PATH}=true`))
  assert.equal(input.calls.filter(entry => entry === 'eq:status=evaluation_pending').length, 2)
  assert.equal(input.calls.filter(entry => entry === 'like:candidate_id=mass:%').length, 2)
})

test('every other waiting student still counts, so a real backlog still pauses training', async () => {
  // 90 waiting, only 2 exam-paused: 88 is still over the limit and training stays closed. The exclusion is
  // narrow by design - it must not become a general-purpose way to make the backlog look smaller.
  const input = fakeDb({ count: 90, error: null }, { count: 2, error: null })
  const gate = await readMassEvaluationBacklogGate({ db: input.db as any, env: {} })
  assert.equal(gate.pendingEvaluation, 88)
  assert.equal(gate.examPausedExcluded, 2)
  assert.equal(gate.open, false)
  assert.equal(gate.reason, 'evaluation_backlog_full')
})

test('an unreadable exclusion keeps the full backlog rather than opening spend', async () => {
  // Fail closed for spend: if we cannot prove a student is exam-paused, it counts.
  for (const second of [
    { count: null, error: { message: 'timeout' } } as Result,
    new Error('network'),
    { count: null, error: null } as Result,
  ]) {
    const input = fakeDb({ count: 61, error: null }, second)
    const gate = await readMassEvaluationBacklogGate({ db: input.db as any, env: {} })
    assert.equal(gate.pendingEvaluation, 61, 'a failed exclusion read must not shrink the backlog')
    assert.equal(gate.examPausedExcluded, 0)
    assert.equal(gate.open, false)
  }
})

test('the exclusion can never invent capacity beyond the queue itself', async () => {
  // A nonsense exclusion larger than the queue is clamped, never negative, and never opens the gate wider
  // than an empty queue would.
  const input = fakeDb({ count: 5, error: null }, { count: 900, error: null })
  const gate = await readMassEvaluationBacklogGate({ db: input.db as any, env: {} })
  assert.equal(gate.pendingEvaluation, 0)
  assert.equal(gate.examPausedExcluded, 5)
  assert.equal(massEvaluationBacklogDecision({ pendingEvaluation: 3, limit: 48, examPausedExcluded: -7 }).examPausedExcluded, 0)
})

test('the limit is owner-tunable, bounded, and invalid values fall back to the default', () => {
  assert.equal(massEvaluationBacklogLimit({}), MASS_EVALUATION_BACKLOG_DEFAULT_LIMIT)
  assert.equal(massEvaluationBacklogLimit({ COS_UNIVERSITY_MASS_EVALUATION_BACKLOG_LIMIT: '120' }), 120)
  assert.equal(massEvaluationBacklogLimit({ COS_UNIVERSITY_MASS_EVALUATION_BACKLOG_LIMIT: '999999' }), MASS_EVALUATION_BACKLOG_MAX_LIMIT)
  for (const bad of ['', '-5', 'abc', '1.5', ' ']) {
    assert.equal(massEvaluationBacklogLimit({ COS_UNIVERSITY_MASS_EVALUATION_BACKLOG_LIMIT: bad }), MASS_EVALUATION_BACKLOG_DEFAULT_LIMIT)
  }
})

test('the live workflow pauses new campaign authorization but drains already-authorized campaigns', () => {
  const workflow = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts', import.meta.url), 'utf8')
  const gate = workflow.indexOf('const evaluationBacklog = await readMassEvaluationBacklogGate(')
  const authorization = workflow.indexOf('rollingAuthorization = backlogPaused')
  const consumer = workflow.indexOf('const initialResult: Record<string, any> = await runMassDistillationCampaignConsumer')
  assert.ok(gate > 0)
  assert.ok(authorization > gate)
  assert.ok(consumer > authorization)
  assert.match(workflow, /newCampaignAuthorizationPaused: true/)
  assert.match(workflow, /existingCampaignDrainAllowed: true/)
  assert.match(workflow, /evaluationBacklog,\n\s+backlogDrainMode,\n\s+slowMaintenanceDue,/)
  assert.doesNotMatch(
    workflow.slice(consumer - 80, consumer + 240),
    /backlogPaused\s*\?\s*\{[\s\S]*dispatched:\s*0/,
  )
})
// end of saas/tests/cosUniversityMassEvaluationBacklogGate.node.test.ts (if this line is missing, the paste was cut short)
