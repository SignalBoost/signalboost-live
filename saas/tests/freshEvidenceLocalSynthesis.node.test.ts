// saas/tests/freshEvidenceLocalSynthesis.node.test.ts
// Pins tier-2 behavior: sources-only local synthesis is accepted ONLY with citations; every
// dishonest or failed path returns null so tier 3 takes over. No network, no model.
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
const sources = [{ id: 'LIVE1', title: 'Kantei — Prime Minister of Japan', url: 'https://japan.kantei.go.jp/index.html', snippet: 'The Prime Minister is X.' }]
const args = { input: 'who is the PM of Japan', sources, retrievedAt: '2026-08-15T00:00:00Z', language: 'English' }

test('accepts a cited, sources-grounded local answer', async () => {
  localReply = 'The Prime Minister of Japan is X. [LIVE1] (https://japan.kantei.go.jp/index.html)'
  const out = await synthesizeFreshEvidenceLocally(args)
  assert.ok(out); assert.match(out!.reply, /LIVE1/)
})

test('rejects an uncited answer — uncited synthesis not accepted from ANY model', async () => {
  localReply = 'The Prime Minister of Japan is X.'
  assert.equal(await synthesizeFreshEvidenceLocally(args), null)
})

test('honors the model\'s own EVIDENCE_INSUFFICIENT verdict', async () => {
  localReply = 'EVIDENCE_INSUFFICIENT'
  assert.equal(await synthesizeFreshEvidenceLocally(args), null)
})

test('fails closed when the reasoner is unreachable or empty', async () => {
  localReply = null
  assert.equal(await synthesizeFreshEvidenceLocally(args), null)
  assert.equal(await synthesizeFreshEvidenceLocally({ ...args, sources: [] }), null)
})
