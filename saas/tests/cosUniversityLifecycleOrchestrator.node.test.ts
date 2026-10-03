// saas/tests/cosUniversityLifecycleOrchestrator.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  UNIVERSITY_LIFECYCLE_PLAN,
  lifecycleDeadline,
  lifecyclePlan,
  shouldOrchestrate,
  stageChanged,
} from '../lib/ai/cos/cosUniversityLifecycleOrchestrator.ts'

test('every nonterminal artifact status has one owner, deadline and worker', () => {
  for (const status of ['evaluation_ready', 'evaluation_pending', 'quarantined', 'runtime_pending', 'active']) {
    const plan = lifecyclePlan(status)
    assert.ok(plan, status)
    assert.equal(plan.terminal, false)
    assert.ok(plan.deadlineMs > 0)
    assert.match(String(plan.nextAction), /\S/)
    assert.match(String(plan.workerPath), /^\/api\/cron\//)
  }
  assert.equal(UNIVERSITY_LIFECYCLE_PLAN.retired.terminal, true)
  assert.equal(UNIVERSITY_LIFECYCLE_PLAN.retired.workerPath, null)
})

test('a missed deadline becomes work instead of silence', () => {
  const plan = lifecyclePlan('evaluation_pending')!
  const entered = new Date('2026-10-02T20:00:00Z')
  const deadline = lifecycleDeadline(entered, plan)
  assert.equal(shouldOrchestrate({
    now: new Date(deadline.getTime() - 1),
    deadlineAt: deadline.toISOString(),
    terminal: false,
  }), false)
  assert.equal(shouldOrchestrate({
    now: deadline,
    deadlineAt: deadline.toISOString(),
    terminal: false,
  }), true)
})

test('action spacing prevents a retry storm while preserving durable retry', () => {
  assert.equal(shouldOrchestrate({
    now: new Date('2026-10-02T21:10:00Z'),
    deadlineAt: '2026-10-02T20:00:00Z',
    terminal: false,
    lastActionAt: '2026-10-02T21:08:00Z',
  }), false)
  assert.equal(shouldOrchestrate({
    now: new Date('2026-10-02T21:10:00Z'),
    deadlineAt: '2026-10-02T20:00:00Z',
    terminal: false,
    lastActionAt: '2026-10-02T21:00:00Z',
  }), true)
})

test('a real stage or artifact revision resets the lifecycle clock', () => {
  const evalPlan = lifecyclePlan('evaluation_pending')!
  assert.equal(stageChanged({ stage: 'EXACT_CANARY', artifact_hash: 'a'.repeat(64) }, evalPlan, 'a'.repeat(64)), true)
  assert.equal(stageChanged({ stage: 'INDEPENDENT_EVALUATION', artifact_hash: 'a'.repeat(64) }, evalPlan, 'b'.repeat(64)), true)
  assert.equal(stageChanged({ stage: 'INDEPENDENT_EVALUATION', artifact_hash: 'a'.repeat(64) }, evalPlan, 'a'.repeat(64)), false)
})

test('controller owns progress but cannot grade or widen authority', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-lifecycle-orchestrator/route.ts', import.meta.url), 'utf8')
  assert.match(route, /every_nonterminal_artifact_has_a_named_next_action_and_deadline/)
  assert.match(route, /authorityExpanded: false/)
  assert.doesNotMatch(route, /evaluationPassed\s*:\s*true/)
  assert.doesNotMatch(route, /productionTrafficAuthorized\s*:\s*true/)
  assert.doesNotMatch(route, /status:\s*['"]active['"]/)
})

test('migration persists stage ownership and deadline', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261003003500_university_lifecycle_orchestration.sql', import.meta.url), 'utf8')
  assert.match(migration, /candidate_id text primary key/)
  assert.match(migration, /stage_entered_at timestamptz not null/)
  assert.match(migration, /stage_deadline_at timestamptz not null/)
  assert.match(migration, /orchestration_attempts integer not null/)
  assert.match(migration, /next_action text not null/)
})
