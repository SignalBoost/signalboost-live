// saas/tests/builderNodeTestCommand.node.test.ts
//
// Production 2026-10-22: a repository repair targeting tests/platformObservability.node.test.ts ran it with
// `node --experimental-strip-types`, which fails before any test on a constructor parameter property, "reproduced"
// that runner error as the defect and rewrote working source it could not verify. Builder proofs run TypeScript the
// way the repository's release gates do.

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BUILDER_NODE_TYPESCRIPT, builderNodeTestCommand } from '../lib/builder/node-test-command.ts'
import { repositoryRepairProofCommand } from '../lib/builder/repository-repair-proof-controller.ts'

const saas = fileURLToPath(new URL('..', import.meta.url))
const run = (command: string) => {
  const [bin, ...args] = command.split(' ')
  // A child started inside a test reports to this runner instead of printing, unless it runs as its own suite.
  // NODE_OPTIONS is dropped so only the flags on the command line decide (npm sets --experimental-transform-types
  // there for npm scripts, which would hide the difference this test proves).
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  delete env.NODE_OPTIONS
  return spawnSync(bin === 'node' ? process.execPath : bin, args, { cwd: saas, encoding: 'utf8', timeout: 120_000, env })
}

test('the incident target now gets a proof that runs the real test instead of failing in the runner', () => {
  const proof = repositoryRepairProofCommand({ pathHints: ['saas/tests/platformObservability.node.test.ts'], failedCommand: '' })
  assert.equal(proof, 'node --experimental-transform-types --test tests/platformObservability.node.test.ts')

  const now = run(proof!)
  assert.equal(now.status, 0, now.stdout + now.stderr)
  // The exit code is the proof; the summary only shows tests really ran (TAP "# pass 6" or spec "ℹ pass 6").
  assert.match(now.stdout, /(?:#|ℹ) pass [1-9]\d*/)
  assert.match(now.stdout, /(?:#|ℹ) fail 0/)

  // The command Builder used before: the runner itself fails on TypeScript-only syntax, before any test runs.
  const before = run('node --experimental-strip-types --test tests/platformObservability.node.test.ts')
  assert.notEqual(before.status, 0)
  assert.match(before.stdout + before.stderr, /ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX|parameter property is not supported/)
  console.log('[proof]', JSON.stringify({ proof, exitNow: now.status, exitBefore: before.status }))
})

test('every Builder proof uses the one shared TypeScript runner', () => {
  assert.equal(BUILDER_NODE_TYPESCRIPT, 'node --experimental-transform-types')
  assert.equal(builderNodeTestCommand('tests/a.test.ts tests/b.test.ts'), 'node --experimental-transform-types --test tests/a.test.ts tests/b.test.ts')
  const builder = new URL('../lib/builder/', import.meta.url)
  const hardcoded = readdirSync(builder).filter(name => name.endsWith('.ts') && name !== 'node-test-command.ts')
    .filter(name => /node --experimental-strip-types/.test(readFileSync(new URL(name, builder), 'utf8')))
  assert.deepEqual(hardcoded, [])
})
