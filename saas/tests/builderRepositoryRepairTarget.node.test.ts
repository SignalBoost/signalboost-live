import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseSignalBoostRepositoryRepairTarget,
  resolveSignalBoostRepositoryCommit,
  signalBoostRepositoryRepairObjective,
} from '../lib/builder/repository-repair-target.ts'

const failedLog = [
  '17:43:00.317 Running build in Cleveland, USA (East) – cle1',
  '17:43:00.444 Cloning github.com/SignalBoost/signalboost-live (Branch: fix/cos-remove-hardcoded-comparison-formatter-20260830, Commit: 4cf5fdd)',
  '17:43:12.734 ▲ Next.js 16.2.6 (Turbopack)',
  '17:43:42.044 > Build error occurred',
  '17:43:42.047 Error: Turbopack build failed with 2 errors:',
  '17:43:42.047 ./saas/lib/ai/cos/cosFirstAnswer.ts:15:1',
  "17:43:42.047 Export LIVE_CONSTRUCT_SPLIT_PROMPT doesn't exist in target module",
  '17:43:42.049 The export LIVE_CONSTRUCT_SPLIT_PROMPT was not found in module ./saas/lib/ai/cos/cosFreshGrounding.ts',
  '17:43:42.050 The export liveDraftCollapsesDistinctConstructs was not found in module ./saas/lib/ai/cos/cosFreshGrounding.ts',
  '17:43:42.178 Error: Command "node scripts/vercel-cos-gates.mjs && npm run prebuild && next build" exited with 1',
].join('\n')

test('extracts the exact SignalBoost branch, revision, source paths and missing symbols from a failed Vercel log', () => {
  const target = parseSignalBoostRepositoryRepairTarget(failedLog)
  assert.ok(target)
  assert.equal(target.repository, 'SignalBoost/signalboost-live')
  assert.equal(target.branch, 'fix/cos-remove-hardcoded-comparison-formatter-20260830')
  assert.equal(target.commitSha, '4cf5fdd')
  assert.equal(target.fullCommitSha, null)
  assert.equal(target.projectRoot, 'saas')
  assert.ok(target.pathHints.includes('saas/lib/ai/cos/cosFirstAnswer.ts'))
  assert.ok(target.pathHints.includes('saas/lib/ai/cos/cosFreshGrounding.ts'))
  assert.ok(target.symbolHints.includes('LIVE_CONSTRUCT_SPLIT_PROMPT'))
  assert.ok(target.symbolHints.includes('liveDraftCollapsesDistinctConstructs'))
  assert.match(target.failedCommand || '', /vercel-cos-gates/)
})

test('resolves a short revision to one immutable full commit before sandbox setup', async () => {
  const target = parseSignalBoostRepositoryRepairTarget(failedLog)
  assert.ok(target)
  const fullSha = `4cf5fdd${'0'.repeat(33)}`
  const calls: string[] = []
  const request = (async (url: string) => {
    calls.push(url)
    return {
      ok: true,
      status: 200,
      json: async () => ({ sha: fullSha }),
    } as Response
  }) as typeof fetch
  const resolved = await resolveSignalBoostRepositoryCommit(target, request)
  assert.equal(resolved.fullCommitSha, fullSha)
  assert.equal(calls.length, 1)
  assert.match(calls[0], /\/repos\/SignalBoost\/signalboost-live\/commits\/4cf5fdd$/)
})

test('builds a bounded repair objective with workspace-relative paths and explicit non-merge authority', async () => {
  const parsed = parseSignalBoostRepositoryRepairTarget(failedLog)
  assert.ok(parsed)
  const target = { ...parsed, fullCommitSha: `4cf5fdd${'0'.repeat(33)}` }
  const objective = signalBoostRepositoryRepairObjective(target)
  assert.ok(objective.length <= 7_900)
  assert.match(objective, /exact commit 4cf5fdd0{33}/)
  assert.match(objective, /Path hints: lib\/ai\/cos\/cosFirstAnswer\.ts/)
  assert.doesNotMatch(objective, /Path hints: saas\//)
  assert.match(objective, /Do not .*commit, push, merge, deploy/i)
})

test('rejects arbitrary repositories, successful logs, missing revisions and malformed branches', () => {
  assert.equal(parseSignalBoostRepositoryRepairTarget(failedLog.replace('SignalBoost/signalboost-live', 'other/project')), null)
  assert.equal(parseSignalBoostRepositoryRepairTarget(failedLog.replace('exited with 1', 'exited with 0').replace(/failed/gi, 'completed')), null)
  assert.equal(parseSignalBoostRepositoryRepairTarget(failedLog.replace(', Commit: 4cf5fdd', '')), null)
  assert.equal(parseSignalBoostRepositoryRepairTarget(failedLog.replace('fix/cos-remove-hardcoded-comparison-formatter-20260830', '../unsafe')), null)
})
