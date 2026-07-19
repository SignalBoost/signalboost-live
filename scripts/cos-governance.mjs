#!/usr/bin/env node
/** Governance gate for the canonical COS brain and Backup COS manifest. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const brainPath = resolve(root, 'cos-core/brain.md')
const manifestPath = resolve(root, 'cos-core/backup-manifest.json')
const primaryPaths = ['app/api/support/route.ts', 'lib/concierge/unifiedConcierge.ts', 'lib/cos/backupCos.ts']
const allowed = new Set((process.env.COS_GOVERNANCE_ALLOWED_SIGNERS || '').split(',').map(v => v.trim()).filter(Boolean))

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
function hashFile(path) { return createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') }
function verifyGovernanceSignature(commit) {
  if (!/^[0-9a-f]{40}$/i.test(commit)) return false
  if (allowed.size === 0) return false
  try {
    const status = execFileSync('git', ['verify-commit', '--raw', commit], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const fingerprint = `${status}`.match(/\[GNUPG:\] VALIDSIG ([0-9A-F]+)/)?.[1]
    return Boolean(fingerprint && allowed.has(fingerprint))
  } catch { return false }
}
function sync(commit) {
  const ok = verifyGovernanceSignature(commit)
  const log = { ok, sourceCommit: commit, synced: ok, message: ok ? 'Update applied' : 'Rejected - invalid commit' }
  if (!ok) return log
  const primaryHash = createHash('sha256').update(primaryPaths.map(hashFile).join(':')).digest('hex')
  const brain = readFileSync(brainPath, 'utf8').replace(
    /<!-- COS-GOVERNANCE-SYNC:.* -->/,
    `<!-- COS-GOVERNANCE-SYNC: sourceCommit=${commit}; primaryHash=${primaryHash}; syncedAt=${new Date().toISOString()} -->`,
  )
  writeFileSync(brainPath, brain)
  writeFileSync(manifestPath, `${JSON.stringify({ schemaVersion: 1, sourceCommit: commit, primaryHash, backupMode: 'observe_only' }, null, 2)}\n`)
  return log
}
function guard() {
  const changed = git(['diff', '--name-only', 'HEAD^', 'HEAD']).split('\n')
  if (!changed.some(path => path === 'cos-core/brain.md' || path === 'cos-core/backup-manifest.json')) return
  const commit = git(['rev-parse', 'HEAD'])
  if (!verifyGovernanceSignature(commit)) throw new Error('COS core changed without a valid governance signature; Backup COS remains unsynchronized.')
  if (!existsSync(manifestPath)) throw new Error('COS core changed without a Backup COS manifest.')
}
const [command, commit] = process.argv.slice(2)
try {
  if (command === 'sync') console.log(JSON.stringify(sync(commit)))
  else if (command === 'guard') { guard(); console.log('COS Core Governance: verified') }
  else throw new Error('Usage: node scripts/cos-governance.mjs <sync COMMIT|guard>')
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1) }
