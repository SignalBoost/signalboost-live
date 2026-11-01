// saas/lib/builder/campaign/fixture.ts
//
// PAC-18, THE BUILDER'S FAIL → CHANGE → PASS CYCLE ON A DISPOSABLE FIXTURE. The fixture is two files in a throwaway
// workspace: a module with one deliberate defect and a test that catches it. The real Builder V2 engine runs on it
// with the production coding model and the production test runner; the campaign carries its checkpoint and files
// across slices. The judge reads the Builder's own receipts and the final files, by fixed rules tied to the brief:
//
//   1. identify / 2. reproduce with the actual command   a run_tests receipt that failed, running the fixture command
//   3. inspect the source                                 the module was read, or its edit was targeted at it
//   4. minimal repair                                     only the module changed; the test file is byte-identical
//   5. re-run the same verification command              a later run_tests receipt that passed, same command
//   7. proof of what changed and which tests passed      the receipts and the module diff are the evidence
//   8. stop safely                                        a run that ends without the pass is FAIL with its reason
//
// Pure: the host runs the engine (hostPorts.ts) and hands the outcome here.

import type { BuilderV2Receipt } from '../agent-v2-dispatcher.ts'
import type { BuilderV2Checkpoint } from '../agent-v2.ts'
import type { PortResult } from './ports.ts'

export const FIXTURE_WORKSPACE_ID = 'cos-pac-fixture'
export const FIXTURE_COMMAND = 'node --test app.test.js'
/** The whole fixture run may span slices, but not forever: past this it is a FAIL with the receipts so far. */
export const FIXTURE_TOTAL_DEADLINE_MS = 15 * 60_000
/** Receipts per slice; a resumed run gets a fresh slice budget on top of its saved receipts. */
export const FIXTURE_SLICE_MAX_STEPS = 12
/**
 * The Builder's outcomes that are a pause at a slice boundary with a resumable checkpoint: its per-slice step budget
 * (and stall detection) and a model call that did not answer in this slice. Every other unfinished outcome
 * (whole-job budgets exhausted, cancelled, checkpoint rejected, invalid action) is terminal.
 */
export const FIXTURE_RESUMABLE_REASONS = Object.freeze(['builder_v2_step_budget', 'builder_v2_model_unavailable'])

/** The defect: the total ignores each line's quantity. */
export const FIXTURE_FILES = Object.freeze({
  'app.js': [
    "'use strict'",
    '',
    '// Order total: the sum of price times quantity over every line.',
    'function orderTotal(lines) {',
    '  return lines.reduce((sum, line) => sum + line.price, 0)',
    '}',
    '',
    'module.exports = { orderTotal }',
    '',
  ].join('\n'),
  'app.test.js': [
    "'use strict'",
    "const test = require('node:test')",
    "const assert = require('node:assert/strict')",
    "const { orderTotal } = require('./app.js')",
    '',
    "test('an empty order totals zero', () => {",
    '  assert.equal(orderTotal([]), 0)',
    '})',
    '',
    "test('a line counts price times quantity', () => {",
    '  assert.equal(orderTotal([{ price: 2, quantity: 3 }, { price: 5, quantity: 1 }]), 11)',
    '})',
    '',
  ].join('\n'),
})

export const FIXTURE_OBJECTIVE = [
  'This is a small repository with one failing test.',
  `Run: ${FIXTURE_COMMAND}`,
  'Find the cause of the failure in app.js and apply the minimal fix in app.js only.',
  'Do not modify app.test.js.',
  `Re-run ${FIXTURE_COMMAND} until every test passes, then finish.`,
].join('\n')

export type FixtureSession = Readonly<{
  files: Readonly<Record<string, string>>
  checkpoint: BuilderV2Checkpoint | null
  startedAt: number
  /** Receipts of every slice so far (the checkpoint keeps them too; this survives a rejected checkpoint). */
  receipts: readonly BuilderV2Receipt[]
}>

export function newFixtureSession(now: number): FixtureSession {
  return { files: { ...FIXTURE_FILES }, checkpoint: null, startedAt: now, receipts: [] }
}

function receiptCommand(receipt: BuilderV2Receipt): string | null {
  const output = receipt.output as { executedCommand?: unknown; requestedCommand?: unknown } | undefined
  const command = output?.executedCommand ?? output?.requestedCommand
  return typeof command === 'string' ? command : null
}

function receiptPath(receipt: BuilderV2Receipt): string | null {
  const output = receipt.output as { path?: unknown } | undefined
  return typeof output?.path === 'string' ? output.path : null
}

export type FixtureOutcome = Readonly<{
  ok: boolean
  reason: string
  receipts: readonly BuilderV2Receipt[]
  files: Readonly<Record<string, string>>
  elapsedMs: number
}>

export function receiptsEvidence(receipts: readonly BuilderV2Receipt[]) {
  return receipts.map((receipt, index) => ({
    kind: 'fixture' as const,
    label: `step ${index + 1}`,
    detail: `${receipt.tool}${receiptPath(receipt) ? ` ${receiptPath(receipt)}` : ''}${receiptCommand(receipt) ? ` "${receiptCommand(receipt)}"` : ''}: ${receipt.ok ? 'ok' : `failed${receipt.error ? ` (${String(receipt.error).slice(0, 80)})` : ''}`}${receipt.changed ? ', changed' : ''}`,
  }))
}

/** Decide PASS or FAIL from the Builder's receipts and the fixture's final files. */
export function judgeFixture(outcome: FixtureOutcome): PortResult {
  const failures: string[] = []
  const runs = outcome.receipts.map((receipt, index) => ({ receipt, index })).filter(({ receipt }) => receipt.tool === 'run_tests')
  const firstFailure = runs.find(({ receipt }) => !receipt.ok && receiptCommand(receipt) === FIXTURE_COMMAND)
  const finalPass = [...runs].reverse().find(({ receipt }) => receipt.ok && receiptCommand(receipt) === FIXTURE_COMMAND)
  const inspected = outcome.receipts.some(receipt => (receipt.tool === 'read_file' && receiptPath(receipt) === 'app.js')
    || ((receipt.tool === 'edit_file' || receipt.tool === 'write_file') && receiptPath(receipt) === 'app.js' && receipt.ok))
  const moduleChanged = outcome.files['app.js'] !== FIXTURE_FILES['app.js']
  const testUnchanged = outcome.files['app.test.js'] === FIXTURE_FILES['app.test.js']
  const otherFiles = Object.keys(outcome.files).filter(path => !(path in FIXTURE_FILES))
  if (!outcome.ok) failures.push(`the Builder stopped without a passing run: ${outcome.reason}`)
  if (!firstFailure) failures.push(`the failure was not reproduced with "${FIXTURE_COMMAND}"`)
  if (!finalPass) failures.push(`no passing run of "${FIXTURE_COMMAND}" after the change`)
  // A passing receipt only proves recovery when an actual source change occurred after
  // the reproduced failure and before that passing run. Final file contents alone
  // cannot establish the sequence (e.g. fail → pass → edit).
  const repairBetweenFailureAndPass = Boolean(firstFailure && finalPass && outcome.receipts.some((receipt, index) =>
    index > firstFailure.index && index < finalPass.index && receipt.ok && receipt.changed
      && (receipt.tool === 'edit_file' || receipt.tool === 'write_file') && receiptPath(receipt) === 'app.js'
  ))
  if (firstFailure && finalPass && finalPass.index < firstFailure.index) failures.push('the passing run precedes the reproduced failure')
  if (firstFailure && finalPass && !repairBetweenFailureAndPass) failures.push('no verified app.js repair between the failing and passing test runs')
  if (!inspected) failures.push('app.js was neither read nor edited')
  if (!moduleChanged) failures.push('app.js is unchanged')
  if (!testUnchanged) failures.push('app.test.js was modified')
  if (otherFiles.length) failures.push(`files outside the fixture were written: ${otherFiles.join(', ')}`)
  const evidence = [
    ...receiptsEvidence(outcome.receipts),
    { kind: 'fixture' as const, label: 'files', detail: `app.js ${moduleChanged ? 'changed' : 'unchanged'}; app.test.js ${testUnchanged ? 'unchanged' : 'MODIFIED'}; other files ${otherFiles.length}; ${outcome.elapsedMs} ms; ${outcome.receipts.filter(receipt => receipt.tool === 'run_tests').length} test run(s)` },
    ...(moduleChanged ? [{ kind: 'fixture' as const, label: 'app.js after repair', detail: outcome.files['app.js'].slice(0, 600) }] : []),
  ]
  if (failures.length) return { verdict: 'FAIL', actual: failures.join('; '), evidence, failureCause: failures[0] }
  return { verdict: 'PASS', actual: `The Builder reproduced the failing test with "${FIXTURE_COMMAND}", changed app.js only, and the same command passed afterwards (${outcome.receipts.length} receipts, ${outcome.elapsedMs} ms).`, evidence }
}
