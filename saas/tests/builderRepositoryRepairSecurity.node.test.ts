import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  safeRepositoryChangedPath,
  safeRepositoryWorkspacePath,
} from '../lib/builder/vercel-repository-repair-session.ts'

test('repository repair paths stay inside the staged saas project and exclude secrets or dependency trees', () => {
  assert.equal(safeRepositoryWorkspacePath('saas/lib/ai/cos/cosFirstAnswer.ts'), 'lib/ai/cos/cosFirstAnswer.ts')
  assert.equal(safeRepositoryWorkspacePath('./tests/example.node.test.ts'), 'tests/example.node.test.ts')
  for (const value of [
    '../outside.ts',
    'lib/../../outside.ts',
    '/etc/passwd',
    '.git/config',
    'node_modules/pkg/index.js',
    '.env',
    '.env.production',
    'config/service-account.json',
    'certs/private.key',
    'lib/bad\nname.ts',
  ]) {
    assert.throws(() => safeRepositoryWorkspacePath(value), /builder_invalid_path/)
  }
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
  assert.ok(allow >= 0)
  assert.ok(exactFetch > allow)
  assert.ok(revisionCall > exactFetch)
  assert.ok(install > revisionCall)
  assert.ok(deny > install)
  assert.ok(locked > deny)
  assert.ok(modelGuard > locked)
  assert.ok(revisionCheck >= 0)
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

test('pasted logs no longer acquire repository-repair authority at either ingress', () => {
  const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const builder = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(browser, /ownerRepairAccess|builderPost\(builderRequest\)|executeSignalBoostRepositoryRepair/)
  assert.doesNotMatch(builder, /executeSignalBoostRepositoryRepair|VercelRepositoryRepairSession/)
  assert.match(builder, /isPastedOperationalLog\(objective\)/)
  assert.match(builder, /execution_allowed: false/)
  assert.match(builder, /external_action_taken: false/)
})
