// tests/builderRepositoryRepairSecurity.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  repositoryDependencyCandidates,
  safeRepositoryChangedPath,
  safeRepositoryWorkspacePath,
} from '../lib/builder/vercel-repository-repair-session.ts'

test('repository repair paths stay inside the staged saas project and exclude secrets or dependency trees', () => {
  assert.equal(safeRepositoryWorkspacePath('saas/lib/ai/cos/cosFirstAnswer.ts'), 'lib/ai/cos/cosFirstAnswer.ts')
  assert.equal(safeRepositoryWorkspacePath('./tests/example.node.test.ts'), 'tests/example.node.test.ts')
  for (const value of [
    '../outside.ts', 'lib/../../outside.ts', '/etc/passwd', '.git/config', 'node_modules/pkg/index.js',
    '.env', '.env.production', 'config/service-account.json', 'certs/private.key', 'lib/bad\nname.ts',
  ]) assert.throws(() => safeRepositoryWorkspacePath(value), /builder_invalid_path/)
})

test('one-hop repository discovery exposes moved implementation without broadening the security boundary', () => {
  const wrapper = readFileSync(new URL('../lib/ai/cos/cosFirstAnswer.ts', import.meta.url), 'utf8')
  const candidates = repositoryDependencyCandidates('lib/ai/cos/cosFirstAnswer.ts', wrapper)
  assert.ok(candidates.includes('lib/ai/cos/cosFirstAnswerCore.ts'))
  assert.equal(candidates.some(path => path.startsWith('../') || path.startsWith('/') || path.includes('node_modules')), false)
  assert.deepEqual(
    repositoryDependencyCandidates('lib/example.ts', "import x from '@/private'\nexport * from '../../../outside.ts'\nimport('./child')"),
    [
      'lib/child.ts', 'lib/child.tsx', 'lib/child.js', 'lib/child.mjs', 'lib/child.cjs', 'lib/child.mts', 'lib/child.cts',
      'lib/child/index.ts', 'lib/child/index.tsx', 'lib/child/index.js', 'lib/child/index.mjs', 'lib/child/index.cjs', 'lib/child/index.mts', 'lib/child/index.cts',
    ],
  )
  const session = readFileSync(new URL('../lib/builder/vercel-repository-repair-session.ts', import.meta.url), 'utf8')
  const initialize = session.slice(session.indexOf('private async initializeVisiblePaths'), session.indexOf('private absolutePath'))
  assert.match(initialize, /repositoryDependencyCandidates\(path, file\.content\)/)
  assert.match(initialize, /visiblePaths\.size >= MAX_VISIBLE_FILES/)
})

test('changed-file certification rejects every path outside the staged saas project', () => {
  assert.equal(safeRepositoryChangedPath('saas/lib/builder/tool-loop.ts'), 'lib/builder/tool-loop.ts')
  for (const value of ['ONBOARD.md', 'package.json', 'docs/note.md', '../saas/lib/x.ts', 'saas/.env']) {
    assert.throws(() => safeRepositoryChangedPath(value), /builder_repository_scope_violation/)
  }
})

test('the host pins and installs the repository before permanently denying network access', () => {
  const source = readFileSync(new URL('../lib/builder/vercel-repository-repair-session.ts', import.meta.url), 'utf8')
  const allow = source.indexOf("networkPolicy: 'allow-all'")
  const exactFetch = source.indexOf("'fetch', '--quiet', '--depth', '1', '--no-tags', 'origin', fullCommitSha")
  const revisionCall = source.indexOf('await session.assertPinnedRevision()', exactFetch)
  const revisionCheck = source.indexOf("revision.stdout.trim().toLowerCase() !== expected")
  const install = source.indexOf("['ci', '--ignore-scripts', '--no-audit', '--no-fund']")
  const deny = source.indexOf("sandbox.update({ networkPolicy: 'deny-all' })")
  const locked = source.indexOf('session.networkLocked = true', deny)
  const modelGuard = source.indexOf("if (!this.networkLocked) throw new Error('builder_repository_network_not_locked')")
  assert.ok(allow >= 0); assert.ok(exactFetch > allow); assert.ok(revisionCall > exactFetch); assert.ok(install > revisionCall)
  assert.ok(deny > install); assert.ok(locked > deny); assert.ok(modelGuard > locked); assert.ok(revisionCheck >= 0)
})

test('Builder file writes use argument-safe Node I/O and reject an existing symlink target', () => {
  const source = readFileSync(new URL('../lib/builder/vercel-repository-repair-session.ts', import.meta.url), 'utf8')
  const start = source.indexOf('async writeFile(')
  const end = source.indexOf('async editFile(', start)
  const block = source.slice(start, end)
  assert.ok(start >= 0 && end > start)
  assert.match(block, /exec\('test', \['-L', absolute\]/)
  assert.match(block, /exec\('node', \['-e', writeScript, absolute, encoded\]/)
  assert.doesNotMatch(block, /exec\('sh'|\b-lc\b/)
})

test('patch certification includes staged changes, rejects cross-project changes, and preserves the pinned revision', () => {
  const source = readFileSync(new URL('../lib/builder/vercel-repository-repair-session.ts', import.meta.url), 'utf8')
  const start = source.indexOf('async collectChanges(')
  const end = source.indexOf('async close(', start)
  const block = source.slice(start, end)
  assert.ok(start >= 0 && end > start)
  assert.match(block, /'diff', '--name-only', '-z', '--diff-filter=ACDMRT', 'HEAD'/)
  assert.match(block, /safeRepositoryChangedPath\(path\)/)
  assert.match(block, /'diff', '--no-ext-diff', '--unified=3', 'HEAD'/)
  assert.ok((block.match(/assertPinnedRevision\(\)/g) || []).length >= 2)
})

test('repository repair cannot commit, push, merge, deploy, or inherit credentials', () => {
  const source = readFileSync(new URL('../lib/builder/vercel-repository-repair-session.ts', import.meta.url), 'utf8')
  const createBlock = source.slice(source.indexOf('Sandbox.create({'), source.indexOf('})', source.indexOf('Sandbox.create({')) + 2)
  assert.doesNotMatch(createBlock, /GITHUB_TOKEN|VERCEL_TOKEN|SUPABASE|process\.env/)
  assert.doesNotMatch(source, /\bgit\s+(?:commit|push|merge)\b|createPullRequest|deploy/i)
  assert.match(source, /git[^\n]+diff/)
})

test('Platform Engineer normalizes model run commands and forces exact failed tests over broad npm test', () => {
  const repair = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')
  const importAt = repair.indexOf('normalizeBuilderSandboxCommand')
  const targetedAt = repair.indexOf('function targetedRepositoryCommand', importAt)
  const broadAt = repair.indexOf('/^npm\\s+(?:run\\s+)?test', targetedAt)
  const exactNodeAt = repair.indexOf('node --experimental-strip-types --test', targetedAt)
  const runnerAt = repair.indexOf('const repositoryRunner: BuilderRunnerPort', exactNodeAt)
  const normalizeAt = repair.indexOf('command: targetedRepositoryCommand(runInput.command, target)', runnerAt)
  const loopAt = repair.indexOf('repositoryRunner,', normalizeAt)
  assert.ok(importAt >= 0 && targetedAt > importAt && broadAt > targetedAt && exactNodeAt > broadAt)
  assert.ok(runnerAt > exactNodeAt && normalizeAt > runnerAt && loopAt > normalizeAt)
  assert.match(repair.slice(runnerAt, loopAt + 32), /session!\.run/)
})

test('browser repository repair is owner-only, SignalBoost-bound, exact-first, immutable-pinned, and durably queued', () => {
  const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(browser, /const deployment = \{[\s\S]*commitSha: process\.env\.VERCEL_GIT_COMMIT_SHA[\s\S]*branch: process\.env\.VERCEL_GIT_COMMIT_REF/)
  assert.match(browser, /const signalBoostProjectBound = SIGNALBOOST_OPERATIONAL_TARGET\.test\(operationalPrompt\) \|\| isSignalBoostDeploymentContext\(req\)/)
  const exact = browser.indexOf('const exactFailedLogTarget =')
  const ownerTarget = browser.indexOf('const ownerRepositoryRepairTarget =', exact)
  const exactPreference = browser.indexOf('? exactFailedLogTarget', ownerTarget)
  const deployedFallback = browser.indexOf('signalBoostDeployedRepairTarget(prompt, deployment)', exactPreference)
  const clippedFallback = browser.indexOf('signalBoostDeployedRepairTarget(operationalPrompt, deployment, { ownerDeveloperLogSubmission: true })', deployedFallback)
  assert.ok(exact >= 0 && ownerTarget > exact && exactPreference > ownerTarget)
  assert.ok(deployedFallback > exactPreference && clippedFallback > deployedFallback)
  assert.match(browser.slice(ownerTarget, clippedFallback + 160), /access\?\.isOwner && access\.userId && !hasSourceAttachment && signalBoostProjectBound/)
  const helper = browser.match(/async function queueOwnerRepositoryRepair[\s\S]*?\n}\n/)?.[0] || ''
  assert.match(helper, /enqueueSignalBoostRepositoryRepairJob/)
  assert.match(helper, /runBuilderJob\(job\.jobId/)
  assert.match(helper, /status: 'queued'/)
  const repair = readFileSync(new URL('../lib/builder/repository-repair.ts', import.meta.url), 'utf8')
  assert.match(repair, /repository_write_allowed: false/)
  assert.match(repair, /merge_allowed: false/)
})

test('direct Builder prefers an exact failed-log revision, then uses the deployed fallback with no dead-end', () => {
  const builder = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  const parsed = builder.indexOf('const parsedFailedLogTarget =')
  const exact = builder.indexOf('const exactFailedLogTarget =', parsed)
  const preference = builder.indexOf('exactFailedLogTarget ?? signalBoostDeployedRepairTarget(objective', exact)
  const owner = builder.indexOf('if (!access.isOwner)', preference)
  const execute = builder.indexOf('enqueueSignalBoostRepositoryRepairJob({', owner)
  const schedule = builder.indexOf('runBuilderJob(job.jobId, access.userId)', execute)
  const passive = builder.indexOf('isPastedOperationalLog(objective)', schedule)
  assert.ok(parsed >= 0 && exact > parsed && preference > exact)
  assert.ok(owner > preference && execute > owner && schedule > execute && passive > schedule)
  // The clipped-log dead-end is gone: an owner's failed-log paste is never refused with a 400,
  // it falls through to a repair of the deployed commit (the repair job reproduces before editing).
  assert.doesNotMatch(builder, /builder_repository_log_incomplete/)
  assert.doesNotMatch(builder, /hasPinnedRepositoryLog/)
  assert.match(builder, /commitSha: process\.env\.VERCEL_GIT_COMMIT_SHA/)
  assert.match(builder, /const ownerDeveloperLogSubmission = access\.isOwner/)
  assert.doesNotMatch(builder, /body\?\.platformRepair/)
  assert.match(builder, /isOperationalLogEvidence\(objective\)/)
  assert.match(builder, /SIGNALBOOST_OPERATIONAL_TARGET\.test\(objective\)/)
  assert.match(builder, /target: platformRepairTarget/)
  assert.match(builder, /status: 'queued'/)
  assert.match(builder, /builder_repository_repair_owner_required/)
  assert.doesNotMatch(builder, /VercelRepositoryRepairSession/)
})

test('durable job runner revalidates owner authority and exact failed revision before repository execution', () => {
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  const platform = runner.indexOf('if (job.metadata.platformRepair === true)')
  const owner = runner.indexOf('if (!job.ownerAuthorized)', platform)
  const exact = runner.indexOf('parseSignalBoostRepositoryRepairTarget(job.objective)', owner)
  const fallback = runner.indexOf('signalBoostDeployedRepairTarget(job.objective', exact)
  const execute = runner.indexOf('executeSignalBoostRepositoryRepair({', fallback)
  const finish = runner.indexOf('finishBuilderJob({', execute)
  assert.ok(platform >= 0 && owner > platform && exact > owner && fallback > exact && execute > fallback && finish > execute)
})