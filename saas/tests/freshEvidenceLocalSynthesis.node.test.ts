// Pins tier-2 behavior: the local model selects evidence IDs, while the server renders exact URLs.
import assert from 'node:assert/strict'
import test from 'node:test'
import Module from 'node:module'

let localReply: string | null = null
const orig = (Module as any).prototype.require
;(Module as any).prototype.require = function patched(id: string) {
  if (id.endsWith('/local-inference') || id === '@/lib/ai/local-inference') {
    return { callLocalModel: async () => localReply, localInferenceConfigFromEnv: () => ({}) }
  }
  return orig.apply(this, arguments as any)
}

const { synthesizeFreshEvidenceLocally } = require('../lib/ai/cos/freshEvidenceLocalSynthesis')
const sources = [
  { id: 'LIVE1', title: 'Official leadership page', url: 'https://government.gov/leadership', snippet: 'The current president is X.' },
  { id: 'LIVE2', title: 'Independent reference', url: 'https://reference.example/president-x', snippet: 'X is the current president.' },
]
const args = { input: 'who is currently the president?', sources, retrievedAt: '2026-08-16T00:00:00Z', language: 'en' }

test('accepts structured evidence ids and server-renders exact citations', async () => {
  localReply = JSON.stringify({ answer: 'The current president is X.', evidenceIds: ['LIVE1', 'LIVE2'] })
  const out = await synthesizeFreshEvidenceLocally(args)
  assert.ok(out)
  assert.match(out!.reply, /\[LIVE1\] \(https:\/\/government\.gov\/leadership\)/)
  assert.match(out!.reply, /\[LIVE2\] \(https:\/\/reference\.example\/president-x\)/)
})

test('rejects a leadership answer that selects only one host', async () => {
  localReply = JSON.stringify({ answer: 'The current president is X.', evidenceIds: ['LIVE1'] })
  assert.equal(await synthesizeFreshEvidenceLocally(args), null)
})

test('rejects invented evidence ids', async () => {
  localReply = JSON.stringify({ answer: 'The current president is X.', evidenceIds: ['LIVE99'] })
  assert.equal(await synthesizeFreshEvidenceLocally(args), null)
})

test('honors EVIDENCE_INSUFFICIENT and malformed output', async () => {
  localReply = JSON.stringify({ answer: 'EVIDENCE_INSUFFICIENT', evidenceIds: [] })
  assert.equal(await synthesizeFreshEvidenceLocally(args), null)
  localReply = 'The current president is X.'
  assert.equal(await synthesizeFreshEvidenceLocally(args), null)
})

test('fails closed when the reasoner is unreachable or evidence is empty', async () => {
  localReply = null
  assert.equal(await synthesizeFreshEvidenceLocally(args), null)
  assert.equal(await synthesizeFreshEvidenceLocally({ ...args, sources: [] }), null)
})
