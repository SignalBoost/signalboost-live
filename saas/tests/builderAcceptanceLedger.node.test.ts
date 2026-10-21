import assert from 'node:assert/strict'
import test from 'node:test'
import { builderAcceptanceLedger } from '../lib/builder/acceptance-ledger.ts'
import type { BuilderV2Receipt } from '../lib/builder/agent-v2-dispatcher.ts'

const objective = `Initially implement a defective addition function and reproduce the failure.
Execute npm test and node --test test/*.test.js. Both commands must pass.`
const run = (command: string, ok: boolean): BuilderV2Receipt => ({
  tool: 'run_tests', ok, changed: false,
  output: { requestedCommand: command, executedCommand: command, exitCode: ok ? 0 : 1, timedOut: false },
})
const edit: BuilderV2Receipt = { tool: 'edit_file', ok: true, changed: true }
const passing = [run('npm test', false), edit, run('npm test', true), run('node --test test/*.test.js', true)]

test('accepts initial failure followed by both independent passing commands after source edit', () => {
  const ledger = builderAcceptanceLedger(objective, passing)
  assert.equal(ledger.passed, true)
  assert.equal(ledger.initialFailureReproduced, true)
  assert.equal(ledger.commands.length, 2)
  assert.ok(ledger.commands.every(command => command.passed))
})

test('does not accept an earlier success invalidated by a later source change', () => {
  const ledger = builderAcceptanceLedger(objective, [...passing, edit])
  assert.equal(ledger.passed, false)
  assert.equal(ledger.failureCode, 'builder_acceptance_required_command_unverified')
})

test('does not substitute npm test for explicit node test invocation', () => {
  const ledger = builderAcceptanceLedger(objective, passing.slice(0, 3))
  assert.equal(ledger.passed, false)
  assert.equal(ledger.commands[1]?.receiptIndex, -1)
})

test('rejects simulated model success without host command receipts', () => {
  assert.equal(builderAcceptanceLedger(objective, [edit]).passed, false)
})

test('requires actual reproduced failure when explicitly requested', () => {
  const ledger = builderAcceptanceLedger(objective, [edit, run('npm test', true), run('node --test test/*.test.js', true)])
  assert.equal(ledger.passed, false)
  assert.equal(ledger.failureCode, 'builder_acceptance_initial_bug_not_reproduced')
})

test('does not convert failed command into passing evidence', () => {
  assert.equal(builderAcceptanceLedger(objective, [run('npm test', false), edit, run('npm test', true), run('node --test test/*.test.js', false)]).passed, false)
})

test('ordinary jobs with no explicit test commands retain current behavior', () => {
  assert.deepEqual(builderAcceptanceLedger('Summarize this README', []), {
    applicable: false, passed: true, failureCode: null, commands: [],
    latestSourceChangeIndex: -1, initialFailureReproduced: false,
  })
})

test('a single compound shell run cannot masquerade as two independent test commands', () => {
  const ledger = builderAcceptanceLedger(objective, [
    run('npm test', false), edit,
    run('npm test && node --test test/*.test.js', true),
  ])
  assert.equal(ledger.passed, false)
  assert.equal(ledger.failureCode, 'builder_acceptance_required_command_unverified')
})
