import assert from 'node:assert/strict'
import test from 'node:test'
import { builderProgressSnapshot } from '../app/api/builder/route.ts'

test('Builder V2 status reports durable operations and last real host test without source leakage', () => {
 const checkpoint = { version: 2, steps: [
  { tool: 'write_file', changed: true, ok: true, output: { path: 'secret.js' } },
  { tool: 'run_tests', changed: false, ok: false, output: { requestedCommand: 'npm test', exitCode: 1, stdout: 'ℹ pass 5\nℹ fail 8\n' } },
  { tool: 'edit_file', changed: true, ok: true, output: { path: 'secret.js' } },
  { tool: 'run_tests', changed: false, ok: true, output: { requestedCommand: 'npm test', exitCode: 0, stdout: 'ℹ pass 13\nℹ fail 0\n' } },
 ], modelCalls: 2 }
 const actual = builderProgressSnapshot({ checkpoint, status: 'paused', updatedAt: '2026-10-21T20:00:00Z', claimGeneration: 1, metadata: {} } as never)
 assert.equal(actual.filesWritten, 2)
 assert.equal(actual.workRounds, 4)
 assert.equal(actual.modelCalls, 2)
 assert.deepEqual(actual.lastTest, { passed: true, exitCode: 0, testsPassed: 13, testsFailed: 0, command: 'npm test' })
 assert.doesNotMatch(JSON.stringify(actual), /secret\.js/)
})
