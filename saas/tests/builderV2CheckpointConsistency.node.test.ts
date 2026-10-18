import test from 'node:test'
import assert from 'node:assert/strict'
import { validateBuilderV2ReceiptHistory } from '../lib/builder/agent-v2.ts'
import type { BuilderV2Checkpoint } from '../lib/builder/agent-v2.ts'

const base = {
  version: 2, workspaceId: 'w', objectiveDigest: 'objective', workspaceDigest: 'workspace',
  idleSlices: 0, modelCalls: 1, lastReceipt: '',
} as const
test('a failing host run invalidates earlier passing verification without invalidating the checkpoint', () => {
  const steps = [
    {tool: 'write_file', ok: true, changed: true, output: {path: 'src/orders.js'}},
    {tool: 'run_tests', ok: true, changed: false, output: {exitCode: 0, timedOut: false}},
    {tool: 'run_tests', ok: false, changed: false, output: {exitCode: 1, timedOut: false}},
  ] as const
  const checkpoint = {...base, steps, revision: 1, verifiedRevision: -1, unproductive: 1} as BuilderV2Checkpoint
  assert.equal(validateBuilderV2ReceiptHistory(checkpoint), true)
  assert.equal(validateBuilderV2ReceiptHistory({...checkpoint, verifiedRevision: 1}), false)
})
test('checkpoint after many writes followed by a failed test remains resumable', () => {
  const steps = [...Array.from({length: 15}, (_, i) => ({tool: 'write_file', ok: true, changed: true, output: {path: 'file'+i}})),
    {tool: 'run_tests', ok: false, changed: false, output: {exitCode: 1, timedOut: false}}]
  assert.equal(validateBuilderV2ReceiptHistory({...base, steps, revision: 15, verifiedRevision: -1, unproductive: 1} as BuilderV2Checkpoint), true)
})
test('forged successful receipt without host proof remains invalid', () => {
  const steps = [{tool: 'run_tests', ok: true, changed: false, output: {exitCode: 1, timedOut: false}}]
  assert.equal(validateBuilderV2ReceiptHistory({...base, steps, revision: 0, verifiedRevision: 0, unproductive: 0} as BuilderV2Checkpoint), false)
})
