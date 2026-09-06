// saas/tests/builderRepositoryHistoryEvidence.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { signalBoostRepositoryRepairObjective } from '../lib/builder/repository-repair-target.ts'

const session = readFileSync(new URL('../lib/builder/vercel-repository-repair-session.ts', import.meta.url), 'utf8')
const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')

const target = {
  repository: 'SignalBoost/signalboost-live',
  branch: 'main',
  commitSha: '417b6c6',
  fullCommitSha: '417b6c6aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  projectRoot: 'saas',
  trigger: 'failed_build_log' as const,
  failedCommand: 'next build',
  pathHints: ['saas/lib/builder/job-runner.ts'],
  symbolHints: ['claimGeneration'],
  failureEvidence: ["Property 'claimGeneration' is missing in type"],
}

test('the pinned repository is fetched with enough history to read a regression', () => {
  // A single commit cannot show what the previous commit removed.
  assert.doesNotMatch(session, /'--depth', '1'/)
  assert.match(session, /const REPOSITORY_HISTORY_DEPTH = (\d+)/)
  const depth = Number(/const REPOSITORY_HISTORY_DEPTH = (\d+)/.exec(session)?.[1])
  assert.ok(depth >= 25, `history depth must allow a real log, got ${depth}`)
  assert.match(session, /'--depth', String\(REPOSITORY_HISTORY_DEPTH\)/)
})

test('a contract mismatch directs the repair at history before it edits source', () => {
  const objective = signalBoostRepositoryRepairObjective(target as never)
  assert.match(objective, /git log --oneline/)
  assert.match(objective, /git show <sha> -- <file>/)
  assert.match(objective, /git show <sha>\^:<file>/)
  assert.match(objective, /read what the recent commits removed/)
})

test('history access stays read-only and never relaxes the write boundary', () => {
  const objective = signalBoostRepositoryRepairObjective(target as never)
  assert.match(objective, /read-only/)
  assert.match(objective, /committing, pushing, and merging remain forbidden/)
  assert.match(objective, /Do not weaken tests, access another repository, use the network, commit, push, merge, deploy/)
})

test('the objective still fits the durable intake bound and is deployment-gated', () => {
  assert.ok(signalBoostRepositoryRepairObjective(target as never).length <= 7_900)
  assert.match(gate, /tests\/builderRepositoryHistoryEvidence\.node\.test\.ts/)
})
