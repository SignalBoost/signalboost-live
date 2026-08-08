import test from 'node:test'
import assert from 'node:assert/strict'
import { applyMissionTick, createMissionLifecycleState, deterministicCompletionSatisfied, setMissionCheckpoint } from '../lib/ai/cos/autonomy/missionLifecycle.ts'

const mission = {
  missionId: 'repair-1',
  purpose: 'Repair the broken outreach pipeline.',
  priorities: ['restore service'],
  constraints: ['respect governance'],
  successCriteria: ['pipeline verified healthy'],
}

function monitoringTick() {
  return {
    missionId: mission.missionId,
    portableId: 'portable-1',
    observed: {
      observedAt: new Date().toISOString(),
      summary: 'Investigating files',
      facts: { stage: 'read' },
      evidenceIds: ['file:a.ts'],
      stateFingerprint: 'read-a',
    },
    decision: {
      decisionId: 'd-read',
      objective: '',
      priority: 'medium' as const,
      rationale: 'More evidence is required.',
      evidenceIds: ['file:a.ts'],
      shouldAct: false,
      confidence: 0.9,
    },
    status: 'monitoring' as const,
    summary: 'Read one file; mission is not yet resolved.',
  }
}

function successfulActionTick() {
  return {
    missionId: mission.missionId,
    portableId: 'portable-1',
    observed: {
      observedAt: new Date().toISOString(),
      summary: 'Fault reproduced',
      facts: { broken: true },
      evidenceIds: ['e:broken'],
      stateFingerprint: 'broken',
    },
    decision: {
      decisionId: 'd-fix',
      objective: 'Fix the defect.',
      priority: 'high' as const,
      rationale: 'Grounded defect found.',
      evidenceIds: ['e:broken'],
      shouldAct: true,
      confidence: 0.99,
    },
    actionRun: {
      runId: 'run-fix',
      portableId: 'portable-1',
      objective: 'Fix the defect.',
      status: 'completed' as const,
      stopReason: 'goal_satisfied' as const,
      summary: 'Patch applied and verified.',
      cycles: [{
        cycle: 1,
        observation: {
          observedAt: new Date().toISOString(),
          summary: 'Fault reproduced',
          facts: {},
          evidenceIds: ['e:broken'],
          stateFingerprint: 'broken',
        },
        results: [{ actionId: 'a1', status: 'completed' as const, summary: 'patch', evidenceIds: ['e:patch'] }],
        verification: { status: 'verified' as const, goalSatisfied: true, summary: 'healthy', evidenceIds: ['e:healthy'] },
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      }],
    },
    status: 'acted' as const,
    summary: 'Patch applied and verified.',
  }
}

test('reading files cannot complete a mission', () => {
  const initial = createMissionLifecycleState(mission)
  const next = applyMissionTick(initial, monitoringTick())
  assert.equal(next.status, 'DIAGNOSING')
  assert.equal(next.iteration, 1)
  assert.equal(next.evidenceIds.includes('file:a.ts'), true)
  assert.equal(deterministicCompletionSatisfied(next), false)
})

test('verified goal completes a default mission deterministically', () => {
  const initial = createMissionLifecycleState(mission)
  const next = applyMissionTick(initial, successfulActionTick())
  assert.equal(next.checkpoints.action_completed, true)
  assert.equal(next.checkpoints.verification_passed, true)
  assert.equal(next.checkpoints.goal_verified, true)
  assert.equal(next.status, 'COMPLETED')
})

test('portable-specific checkpoints prevent premature completion', () => {
  const initial = createMissionLifecycleState(mission, {
    completionPolicy: { requiredCheckpoints: ['tests_passed', 'pr_created', 'deployment_healthy'] },
  })
  let next = applyMissionTick(initial, successfulActionTick())
  assert.notEqual(next.status, 'COMPLETED')
  next = setMissionCheckpoint(next, 'tests_passed', true)
  next = setMissionCheckpoint(next, 'pr_created', true)
  assert.equal(deterministicCompletionSatisfied(next), false)
  next = setMissionCheckpoint(next, 'deployment_healthy', true)
  assert.equal(deterministicCompletionSatisfied(next), true)
  assert.equal(next.status, 'COMPLETED')
})

test('mission stops itself after bounded re-entrant budget', () => {
  let state = createMissionLifecycleState(mission, { maxIterations: 2 })
  state = applyMissionTick(state, monitoringTick())
  state = applyMissionTick(state, monitoringTick())
  assert.equal(state.status, 'BLOCKED_EXCEEDED_BUDGET')
  assert.match(state.blockedReason || '', /exceeded 2 re-entrant ticks/i)
})
