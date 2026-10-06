import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SHA = 'a'.repeat(40)
const OLD = 'b'.repeat(40)
function run(scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'vercel-recovery-'))
  const summary = join(dir, 'summary')
  const output = join(dir, 'output')
  const preload = `
    const scenario = ${JSON.stringify(scenario)}
    const sha = ${JSON.stringify(SHA)}
    const old = ${JSON.stringify(OLD)}
    const deploy = (commit, state = 'READY') => ({
      uid: 'dpl_' + commit[0], state, target: 'production', created: commit === sha ? 200 : 100,
      meta: { githubCommitSha: commit, githubCommitRef: 'main' }
    })
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url)
      let status = 200
      let body
      if (u.includes('api.github.com')) {
        status = scenario === 'github-error' ? 503 : 200
        body = { sha: scenario === 'stale' ? old : sha }
      } else if (u.includes('/v6/deployments')) {
        body = { deployments: scenario === 'missing' ? [] : [
          ...(scenario === 'failed' ? [deploy(sha, 'ERROR')] : scenario === 'pending' ? [deploy(sha, 'BUILDING')] : scenario === 'stale' ? [deploy(sha)] : [deploy(old)])
        ] }
      } else if (u.includes('/v9/projects/')) {
        body = { targets: scenario === 'unknown-production' ? {} : { production: { id: 'dpl_old', created: 50, meta: { githubCommitSha: old } } } }
      } else if (u.includes('/v13/deployments/')) {
        body = { errorCode: 'lint_or_type_error' }
      } else if (u.includes('/promote/')) {
        throw Error('Unexpected production mutation')
      } else {
        throw Error('Unexpected URL: ' + u)
      }
      return { ok: status === 200, status, text: async () => JSON.stringify(body), json: async () => body }
    }
  `
  const result = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(preload), '.github/scripts/vercel-promote-main.mjs'], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, VERCEL_TOKEN: 'mock', GITHUB_TOKEN: 'mock', VERCEL_PROJECT_ID: 'test', VERCEL_TEAM_ID: 'test', MAIN_SHA: SHA, HEAD_WAIT_MS: '0', GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output }
  })
  const fs = awaitRead(output)
  const logs = result.stdout + result.stderr
  rmSync(dir, { recursive: true, force: true })
  return { status: result.status, logs, output: fs }
}
function awaitRead(path) { try { return readFileSync(path, 'utf8') } catch { return '' } }

test('stale main refuses fallback and never mutates production', () => {
  const r = run('stale')
  assert.equal(r.status, 1)
  assert.match(r.logs, /Stale recovery run/)
  assert.doesNotMatch(r.output, /fallback=deploy/)
})
test('GitHub API error fails closed', () => {
  const r = run('github-error')
  assert.equal(r.status, 1)
  assert.match(r.logs, /Live main verification failed/)
})
test('failed build exits nonzero and never requests fallback', () => {
  const r = run('failed')
  assert.equal(r.status, 1)
  assert.match(r.logs, /ended ERROR/)
  assert.doesNotMatch(r.output, /fallback=deploy/)
})
test('pending build at deadline exits nonzero without fallback', () => {
  const r = run('pending')
  assert.equal(r.status, 1)
  assert.match(r.logs, /still BUILDING/)
  assert.doesNotMatch(r.output, /fallback=deploy/)
})
test('missing build requests fallback only for verified main', () => {
  const r = run('missing')
  assert.equal(r.status, 0)
  assert.match(r.output, /fallback=deploy/)
})

test('unknown active production target fails closed, never guessing from READY builds', () => {
  const r = run('unknown-production')
  assert.equal(r.status, 1)
  assert.match(r.logs, /Cannot verify active production target/)
  assert.doesNotMatch(r.output, /fallback=deploy/)
})
