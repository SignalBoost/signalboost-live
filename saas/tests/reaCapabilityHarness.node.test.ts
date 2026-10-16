import assert from 'node:assert/strict'
import test from 'node:test'
import { executeReaCapability, validateReaTimeSeries } from '../lib/ai/cos/reaCapabilityHarness.ts'

const policy = {
  allowedCapabilities: ['structured_data' as const],
  allowedAdapters: ['first', 'second'],
  timeoutMs: 100,
  approvedSpend: false,
  paidAdapters: ['second'],
}
test('REA harness refuses unauthorized capabilities without invoking tools', async () => {
  let called = false
  const result = await executeReaCapability('code_execution', null, [{
    id: 'first', capability: 'code_execution', invoke: async () => { called = true; return { data: 1, evidence: [] } },
  }], policy)
  assert.equal(result.success, false)
  assert.equal(called, false)
  assert.equal(result.attempts.length, 0)
})
test('REA harness records tool failure without silently using unapproved paid fallback', async () => {
  let paidCalled = false
  const result = await executeReaCapability('structured_data', {}, [
    { id: 'first', capability: 'structured_data', invoke: async () => { throw new Error('provider_error') } },
    { id: 'second', capability: 'structured_data', invoke: async () => { paidCalled = true; return { data: 5, evidence: [] } } },
  ], policy)
  assert.equal(result.success, false)
  assert.equal(paidCalled, false)
  assert.equal(result.attempts.length, 1)
  assert.equal(result.attempts[0].status, 'error')
})
test('REA harness falls back only within approved tool scope, preserving evidence', async () => {
  const result = await executeReaCapability('structured_data', {}, [
    { id: 'first', capability: 'structured_data', invoke: async () => { throw new Error('unavailable') } },
    { id: 'second', capability: 'structured_data', invoke: async () => ({ data: { count: 3 }, evidence: ['https://example.org/dataset'] }) },
  ], { ...policy, approvedSpend: true })
  assert.equal(result.success, true)
  assert.equal(result.attempts.length, 2)
  assert.deepEqual(result.receipt?.status === 'ok' ? result.receipt.evidence : [], ['https://example.org/dataset'])
})
test('REA series validation does not invent a chart from a single latest value', () => {
  assert.throws(() => validateReaTimeSeries([{ timestamp: '2026-10-15', value: 13.33 }]), /insufficient_series/)
  assert.deepEqual(validateReaTimeSeries([
    { timestamp: '2026-10-02', value: 8 },
    { timestamp: '2026-09-01', value: 7 },
  ]).map(p => p.value), [7, 8])
  assert.throws(() => validateReaTimeSeries([
    { timestamp: '2026-10-02', value: 8 },
    { timestamp: '2026-10-02', value: 9 },
  ]), /duplicate_series/)
  assert.throws(() => validateReaTimeSeries([
    { timestamp: '2026-10-02', value: Number.NaN },
    { timestamp: '2026-10-03', value: 9 },
  ]), /invalid_series/)
})
test('REA harness bounds a noncooperative adapter and reports timeout', async () => {
  const result = await executeReaCapability('structured_data', {}, [{
    id: 'first', capability: 'structured_data',
    invoke: async () => new Promise<never>(() => {}),
  }], { ...policy, timeoutMs: 5 })
  assert.equal(result.success, false)
  assert.equal(result.attempts[0].status, 'error')
  assert.match(result.attempts[0].status === 'error' ? result.attempts[0].reason : '', /execution_timeout/)
})
