import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { safeRepositoryWorkspacePath } from '../lib/builder/vercel-repository-repair-session.ts'

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
  ]) {
    assert.throws(() => safeRepositoryWorkspacePath(value), /builder_invalid_path/)
  }
})

test('the host pins and installs the repository before permanently denying network access', () => {
  const source = readFileSync(new URL('../lib/builder/vercel-repository-repair-session.ts', import.meta.url), 'utf8')
  const allow = source.indexOf("networkPolicy: 'allow-all'")
  const exactFetch = source.indexOf("'fetch', '--quiet', '--depth', '1', '--no-tags', 'origin', fullCommitSha")
  const revisionCheck = source.indexOf("revision.stdout.trim().toLowerCase() !== fullCommitSha")
  const install = source.indexOf("['ci', '--ignore-scripts', '--no-audit', '--no-fund']")
  const deny = source.indexOf("sandbox.update({ networkPolicy: 'deny-all' })")
  const locked = source.indexOf('session.networkLocked = true', deny)
  const modelGuard = source.indexOf("if (!this.networkLocked) throw new Error('builder_repository_network_not_locked')")
  assert.ok(allow >= 0)
  assert.ok(exactFetch > allow)
  assert.ok(revisionCheck > exactFetch)
  assert.ok(install > revisionCheck)
  assert.ok(deny > install)
  assert.ok(locked > deny)
  assert.ok(modelGuard > locked)
})

test('repository repair cannot commit, push, merge, deploy, or inherit credentials', () => {
  const source = readFileSync(new URL('../lib/builder/vercel-repository-repair-session.ts', import.meta.url), 'utf8')
  const createBlock = source.slice(source.indexOf('Sandbox.create({'), source.indexOf('})', source.indexOf('Sandbox.create({')) + 2)
  assert.doesNotMatch(createBlock, /GITHUB_TOKEN|VERCEL_TOKEN|SUPABASE|process\.env/)
  assert.doesNotMatch(source, /\bgit\s+(?:commit|push|merge)\b|createPullRequest|deploy/i)
  assert.match(source, /git[^\n]+diff/)
})

test('owner repository repair is routed before public-delivery isolation and Builder rechecks owner authority', () => {
  const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const builder = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  const ownerRepair = browser.indexOf('isPastedOperationalLog(prompt) && access?.isOwner')
  const publicExecution = browser.indexOf('const response = await withPublicAuditIdentity', ownerRepair)
  assert.ok(ownerRepair >= 0)
  assert.ok(publicExecution > ownerRepair)
  assert.match(browser.slice(ownerRepair, publicExecution), /builderPost\(builderRequest\)/)
  assert.match(builder, /isPastedOperationalLog\(rawObjective\)[\s\S]*access\.isOwner[\s\S]*executeSignalBoostRepositoryRepair/)
  assert.match(builder, /repository_write_allowed:\s*false|executeSignalBoostRepositoryRepair/)
})
