import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sharedReadinessPodId } from '../lib/ai/cos/runpodPrimaryInference.ts'

const now = Date.parse('2026-09-30T05:15:00Z')

test('a fresh shared readiness record for the same model lets chat skip the readiness proof', () => {
  assert.equal(sharedReadinessPodId({ podId: 'pod-123', model: 'qwen3:30b', provenAt: '2026-09-30T05:13:00Z' }, 'qwen3:30b', now), 'pod-123')
})

test('stale, future-dated, malformed or other-model records force the full proof', () => {
  assert.equal(sharedReadinessPodId({ podId: 'pod-123', model: 'qwen3:30b', provenAt: '2026-09-30T05:09:00Z' }, 'qwen3:30b', now), null)
  assert.equal(sharedReadinessPodId({ podId: 'pod-123', model: 'qwen3:30b', provenAt: '2026-09-30T05:30:00Z' }, 'qwen3:30b', now), null)
  assert.equal(sharedReadinessPodId({ podId: 'pod-123', model: 'qwen2.5-coder:32b', provenAt: '2026-09-30T05:14:00Z' }, 'qwen3:30b', now), null)
  assert.equal(sharedReadinessPodId({ podId: '', model: 'qwen3:30b', provenAt: '2026-09-30T05:14:00Z' }, 'qwen3:30b', now), null)
  assert.equal(sharedReadinessPodId(null, 'qwen3:30b', now), null)
  assert.equal(sharedReadinessPodId({ podId: 'pod-123', model: 'qwen3:30b' }, 'qwen3:30b', now), null)
})

test('chat resolves through the shared record, refreshes it on an answer and clears it on failure', () => {
  const inference = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  const turn = inference.slice(inference.indexOf('async function runpodFirstInteractiveTurn('), inference.indexOf('export async function callLocalModelTurn('))
  assert.match(turn, /await runpod\.resolveRunpodPrimaryConfigForChat\('reasoner'\)/)
  assert.match(turn, /if \(usefulTurn\(turn\)\) void runpod\.noteRunpodPrimaryServed\('reasoner'\)\n\s+else void runpod\.invalidateRunpodPrimaryReadiness\(\)/)
  assert.match(turn, /catch \(error\) \{\n\s+void runpod\.invalidateRunpodPrimaryReadiness\(\)\n\s+throw error/)
  const primary = readFileSync(new URL('../lib/ai/cos/runpodPrimaryInference.ts', import.meta.url), 'utf8')
  assert.match(primary, /readyUntil = Date\.now\(\) \+ READY_TTL_MS\n\s+void writeSharedReadiness\(podId, config\.model\)/)
  assert.match(primary, /return resolveReadyRunpodPrimaryConfig\(workload\)\n\}/)
})
