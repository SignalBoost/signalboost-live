import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workerSource = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')

test('default COS engine registers all five bounded roles', () => {
  assert.match(workerSource, /\['primary', 'coder', 'critic', 'verifier', 'researcher'\]/)
  for (const role of ['CODER', 'CRITIC', 'VERIFIER', 'RESEARCHER']) {
    assert.match(workerSource, new RegExp(`COS SPECIALIST ROLE: ${role}`))
  }
})

test('specialists remain workers over the raw COS open-model executor', () => {
  assert.match(workerSource, /callRawCosReasoner\(effective\)/)
  assert.match(workerSource, /kind:\s*'cos-open-model'/)
  assert.doesNotMatch(workerSource, /external-closed-model/)
})

test('compatibility primary requests are automatically classified unless forcePrimary is set', () => {
  assert.match(workerSource, /selectCosReasoningWorkerRole\(args\.prompt\)/)
  assert.match(workerSource, /forcePrimary === true/)
  assert.match(workerSource, /requestedRole && options\.requestedRole !== 'primary'/)
})

test('role guidance preserves the caller output contract', () => {
  const matches = workerSource.match(/Preserve the caller\\'s exact output contract/g) ?? []
  assert.equal(matches.length, 4)
})
