import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const run = (args, env = {}) => {
  try { return { ok: true, out: execFileSync('node', args, { encoding: 'utf8', env: { ...process.env, ...env } }) } }
  catch (error) { return { ok: false, out: `${error.stdout || ''}${error.stderr || ''}` } }
}

const supervisor = run(['scripts/supervise-cos.mjs'])
assert.equal(supervisor.ok, true, supervisor.out)
assert.match(readFileSync('app/api/concierge/route.ts', 'utf8'), /export \{ dynamic, GET, POST \} from '@\/app\/api\/support\/route'/)

const invalid = run(['scripts/cos-governance.mjs', 'sync', 'not-a-commit'])
assert.equal(invalid.ok, true, invalid.out)
assert.deepEqual(JSON.parse(invalid.out), {
  ok: false,
  sourceCommit: 'not-a-commit',
  synced: false,
  message: 'Rejected - invalid commit',
})
console.log('Backup COS governance checks passed')
