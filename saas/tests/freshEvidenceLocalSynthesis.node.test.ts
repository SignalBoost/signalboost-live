// Pins tier-2 behavior: the local model selects evidence IDs, while the server renders exact URLs.
import assert from 'node:assert/strict'
import test from 'node:test'
import { synthesizeFreshEvidenceLocally } from '../lib/ai/cos/freshEvidenceLocalSynthesis.ts'

let localReply: string | null = null
let failuresRemaining = 0
let localCallCount = 0
let observedTimeoutMs: number[] = []

const config = {
  baseUrl: 'https://reasoner.example/v1',
  model: 'test-model',
  timeoutMs: 120_000,
}

function deps() {
  return {
    config,
    callModel: async (_args: any, callConfig: any) => {
      localCallCount += 1
      observedTimeoutMs.push(Number(callConfig?.timeoutMs))
      if (failuresRemaining > 0) {
        failuresRemaining -= 1
        const error = new Error('This operation was aborted')
        error.name = 'AbortError'
        throw error
      }
      return localReply
    },
  }
}

const sources = [
  { id: 'LIVE1', title: 'Official leadership page', url: 'https://government.gov/leadership', snippet: 'The current president is X.' },
  { id: 'LIVE2', title: 'Independent reference', url: 'https://reference.example/president-x', snippet: 'X is the current president.' },
]
const args = { input: 'who is currently the president?', sources, retrievedAt: '2026-08-16T00:00:00Z', language: 'en' }

function reset() {
  localReply = null
  failuresRemaining = 0
  localCallCount = 0
  observedTimeoutMs = []
}

test('accepts structured evidence ids and server-renders exact citations', async () => {
  reset()
  localReply = JSON.stringify({ answer: 'The current president is X.', evidenceIds: ['LIVE1', 'LIVE2'] })
  const out = await synthesizeFreshEvidenceLocally(args, deps())
  assert.ok(out)
  assert.match(out!.reply, /\[LIVE1\] \(https:\/\/government\.gov\/leadership\)/)
  assert.match(out!.reply, /\[LIVE2\] \(https:\/\/reference\.example\/president-x\)/)
  assert.equal(localCallCount, 1)
})

test('retries one transient timeout locally and keeps each attempt below the global 120s timeout', async () => {
  reset()
  failuresRemaining = 1
  localReply = JSON.stringify({ answer: 'The current president is X.', evidenceIds: ['LIVE1', 'LIVE2'] })
  const out = await synthesizeFreshEvidenceLocally(args, deps())
  assert.ok(out)
  assert.equal(localCallCount, 2)
  assert.deepEqual(observedTimeoutMs, [35_000, 35_000])
})

test('fails closed after two transport failures without external or memory fallback', async () => {
  reset()
  failuresRemaining = 2
  localReply = JSON.stringify({ answer: 'The current president is X.', evidenceIds: ['LIVE1', 'LIVE2'] })
  assert.equal(await synthesizeFreshEvidenceLocally(args, deps()), null)
  assert.equal(localCallCount, 2)
})

test('rejects a leadership answer that selects only one host without retrying a grounding failure', async () => {
  reset()
  localReply = JSON.stringify({ answer: 'The current president is X.', evidenceIds: ['LIVE1'] })
  assert.equal(await synthesizeFreshEvidenceLocally(args, deps()), null)
  assert.equal(localCallCount, 1)
})

test('rejects invented evidence ids', async () => {
  reset()
  localReply = JSON.stringify({ answer: 'The current president is X.', evidenceIds: ['LIVE99'] })
  assert.equal(await synthesizeFreshEvidenceLocally(args, deps()), null)
  assert.equal(localCallCount, 1)
})

test('honors EVIDENCE_INSUFFICIENT and malformed output without retrying', async () => {
  reset()
  localReply = JSON.stringify({ answer: 'EVIDENCE_INSUFFICIENT', evidenceIds: [] })
  assert.equal(await synthesizeFreshEvidenceLocally(args, deps()), null)
  assert.equal(localCallCount, 1)

  reset()
  localReply = 'The current president is X.'
  assert.equal(await synthesizeFreshEvidenceLocally(args, deps()), null)
  assert.equal(localCallCount, 1)
})

test('fails closed when the reasoner returns no text or evidence is empty', async () => {
  reset()
  localReply = null
  assert.equal(await synthesizeFreshEvidenceLocally(args, deps()), null)
  assert.equal(localCallCount, 1)

  reset()
  assert.equal(await synthesizeFreshEvidenceLocally({ ...args, sources: [] }, deps()), null)
  assert.equal(localCallCount, 0)
})
