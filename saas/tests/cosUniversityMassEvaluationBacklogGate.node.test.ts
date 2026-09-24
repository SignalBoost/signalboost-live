// saas/tests/cosUniversityMassEvaluationBacklogGate.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MASS_EVALUATION_BACKLOG_DEFAULT_LIMIT,
  MASS_EVALUATION_BACKLOG_MAX_LIMIT,
  massEvaluationBacklogDecision,
  massEvaluationBacklogLimit,
  readMassEvaluationBacklogGate,
} from '../lib/ai/cos/cosUniversityMassEvaluationBacklogGate.ts'

function fakeDb(result: { count?: number | null; error?: { message?: string } | null } | Error) {
  const calls: string[] = []
  return {
    calls,
    db: {
      from(table: string) {
        calls.push(`from:${table}`)
        return {
          select(columns: string, options: { count: 'exact'; head: true }) {
            calls.push(`select:${columns}:${options.count}:${options.head}`)
            return {
              eq(column: string, value: string) {
                calls.push(`eq:${column}=${value}`)
                return {
                  like(column: string, pattern: string) {
                    calls.push(`like:${column}=${pattern}`)
                    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
                  },
                }
              },
            }
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
  const input = fakeDb({ count: 12, error: null })
  const gate = await readMassEvaluationBacklogGate({ db: input.db as any, env: {} })
  assert.equal(gate.open, true)
  assert.equal(gate.pendingEvaluation, 12)
  assert.deepEqual(input.calls, [
    'from:cos_local_distillation_artifacts',
    'select:candidate_id:exact:true',
    'eq:status=evaluation_pending',
    'like:candidate_id=mass:%',
  ])
})

test('the limit is owner-tunable, bounded, and invalid values fall back to the default', () => {
  assert.equal(massEvaluationBacklogLimit({}), MASS_EVALUATION_BACKLOG_DEFAULT_LIMIT)
  assert.equal(massEvaluationBacklogLimit({ COS_UNIVERSITY_MASS_EVALUATION_BACKLOG_LIMIT: '120' }), 120)
  assert.equal(massEvaluationBacklogLimit({ COS_UNIVERSITY_MASS_EVALUATION_BACKLOG_LIMIT: '999999' }), MASS_EVALUATION_BACKLOG_MAX_LIMIT)
  for (const bad of ['', '-5', 'abc', '1.5', ' ']) {
    assert.equal(massEvaluationBacklogLimit({ COS_UNIVERSITY_MASS_EVALUATION_BACKLOG_LIMIT: bad }), MASS_EVALUATION_BACKLOG_DEFAULT_LIMIT)
  }
})

test('the live workflow gates both new authorization and new paid dispatch on the backlog', () => {
  const workflow = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts', import.meta.url), 'utf8')
  const gate = workflow.indexOf('const evaluationBacklog = await readMassEvaluationBacklogGate(')
  const authorization = workflow.indexOf('rollingAuthorization = backlogPaused')
  const consumer = workflow.indexOf('const initialResult: Record<string, any> = backlogPaused')
  assert.ok(gate > 0)
  assert.ok(authorization > gate)
  assert.ok(consumer > authorization)
  const guarded = workflow.slice(consumer, workflow.indexOf('let result: Record<string, any> = initialResult'))
  assert.match(guarded, /: await runMassDistillationCampaignConsumer\(\{ now, maxDispatches: 5 \}\)/)
  assert.match(workflow, /evaluationBacklog,\n\s+slowMaintenanceDue,/)
})
