import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, '../lib/supervisor/orchestrator.ts'), 'utf8')

function position(needle: string): number {
  const index = source.indexOf(needle)
  assert.notEqual(index, -1, `Expected orchestrator to contain: ${needle}`)
  return index
}

test('Supervisor captures the rollback checkpoint before any repair execution begins', () => {
  const capture = position('await this.deps.snapshotPort.capture(')
  const executionStarted = position("await this.audit(incident, 'execution_started'")
  const dispatcher = position('await this.deps.dispatcher.dispatch(')
  const executor = position('await this.deps.executor.execute(')

  assert.ok(capture < executionStarted, 'snapshot capture must precede execution_started audit')
  assert.ok(capture < dispatcher, 'snapshot capture must precede dispatcher mutation path')
  assert.ok(capture < executor, 'snapshot capture must precede direct executor mutation path')
})

test('Supervisor fails closed when a required checkpoint cannot be captured', () => {
  const captureFailure = position("await this.audit(incident, 'snapshot_capture_failed'")
  const blockedReturn = position('Could not capture the ${scope} checkpoint before repairing, so the repair was not started')
  const dispatcher = position('await this.deps.dispatcher.dispatch(')
  const executor = position('await this.deps.executor.execute(')

  assert.ok(captureFailure < blockedReturn)
  assert.ok(blockedReturn < dispatcher)
  assert.ok(blockedReturn < executor)
})
