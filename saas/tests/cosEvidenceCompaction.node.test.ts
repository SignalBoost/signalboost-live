import assert from 'node:assert/strict'
import test from 'node:test'
import { compactDelegatedEvidence } from '../lib/ai/cos/evidenceCompaction.ts'

test('bounds large connector payloads before COS reasoning', () => {
  const packet = compactDelegatedEvidence({
    ok: true,
    mode: 'delegated',
    missingRequired: [],
    evidence: [{
      capabilityId: 'logs.search',
      result: {
        ok: true,
        providerId: 'logs-provider',
        capabilityId: 'logs.search',
        data: {
          message: 'x'.repeat(5000),
          entries: Array.from({ length: 100 }, (_, i) => ({ i })),
        },
      },
    }],
  })

  assert.equal(packet.items.length, 1)
  const summary = packet.items[0]?.summary as { message: string; entries: unknown[] }
  assert.ok(summary.message.length < 1300)
  assert.equal(summary.entries.length, 25)
})

test('preserves capability and provider provenance in compact packet', () => {
  const packet = compactDelegatedEvidence({
    ok: true,
    mode: 'delegated',
    missingRequired: [],
    evidence: [{ capabilityId: 'deployment.read', result: { ok: true, providerId: 'deploy-provider', capabilityId: 'deployment.read', data: { status: 'ready' } } }],
  })
  assert.equal(packet.items[0]?.capabilityId, 'deployment.read')
  assert.equal(packet.items[0]?.providerId, 'deploy-provider')
  assert.deepEqual(packet.items[0]?.summary, { status: 'ready' })
})
