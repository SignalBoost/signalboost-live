import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diagnoseGitHubWorkflowFailure, observeGitHubWorkflowFailure } from '../lib/code-repair/index.ts'

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'code-repair-diagnosis-'))
  await mkdir(join(root, 'src'), { recursive: true })
  await mkdir(join(root, 'tests'), { recursive: true })
  await writeFile(join(root, 'package.json'), '{}')
  await writeFile(join(root, 'src', 'math.ts'), 'export function add(a:number,b:number): number { return a + b }\n')
  await writeFile(join(root, 'tests', 'math.test.ts'), "import { add } from '../src/math'; add(1, 2)\n")
  return root
}

const snapshot = {
  repository: 'SignalBoost/signalboost-live',
  commitSha: 'abc123',
  runId: 101,
  workflowName: 'SaaS CI',
  changedFiles: ['src/math.ts'],
  jobs: [{
    id: 202,
    name: 'Typecheck (tsc --noEmit)',
    status: 'completed',
    conclusion: 'failure',
    logs: 'TypeScript error in add API_KEY=private-value',
    steps: [
      { name: 'Install dependencies', status: 'completed', conclusion: 'success', number: 1 },
      { name: 'Typecheck', status: 'completed', conclusion: 'failure', number: 2 },
    ],
  }],
} as const

test('observes the failed GitHub job and step without authorizing execution', () => {
  const failure = observeGitHubWorkflowFailure(snapshot)
  assert.equal(failure.incidentId, 'github:SignalBoost/signalboost-live:101:202')
  assert.equal(failure.failedJob, 'Typecheck (tsc --noEmit)')
  assert.equal(failure.failedStep, 'Typecheck')
  assert.match(failure.logs, /TypeScript error/)
})

test('rejects workflow snapshots without a failed job', () => {
  assert.throws(() => observeGitHubWorkflowFailure({
    ...snapshot,
    jobs: [{ ...snapshot.jobs[0], conclusion: 'success', steps: [] }],
  }), /does not contain a failed job/)
})

test('builds an evidence-driven diagnosis plan that remains approval-only', async () => {
  const root = await fixture()
  try {
    const result = await diagnoseGitHubWorkflowFailure(root, snapshot)
    const plan = result.plan
    assert.equal(plan.problem, 'Type contract or import mismatch')
    assert.equal(plan.riskLevel, 'low')
    assert.equal(plan.requiresHumanApproval, true)
    assert.equal(plan.patchGenerationAllowed, false)
    assert.equal(plan.patchApplicationAllowed, false)
    assert.equal(plan.mergeAllowed, false)
    assert.equal(plan.filesToInspect.includes('src/math.ts'), true)
    assert.equal(plan.filesToInspect.includes('tests/math.test.ts'), true)
    assert.deepEqual(plan.filesAllowedToModify, ['src/math.ts'])
    assert.equal(plan.steps.some(step => step.id === 'request-approval' && step.action === 'stop'), true)
    assert.equal(plan.planId.startsWith('repair-plan:'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('diagnosis and plan fingerprints are deterministic', async () => {
  const root = await fixture()
  try {
    const first = await diagnoseGitHubWorkflowFailure(root, snapshot)
    const second = await diagnoseGitHubWorkflowFailure(root, snapshot)
    assert.equal(first.plan.planId, second.plan.planId)
    assert.equal(first.plan.diagnosisFingerprint, second.plan.diagnosisFingerprint)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
