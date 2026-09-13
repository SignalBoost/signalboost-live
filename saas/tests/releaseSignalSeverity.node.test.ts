// saas/tests/releaseSignalSeverity.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  ADVISORY_RELEASE_SIGNALS,
  advisoryReleaseSignals,
  blockingReleaseSignals,
  isBlockingReleaseSignal,
} from '../lib/ai/cos/releaseSignalSeverity.ts'

/**
 * REBUILT 2026-09-13. This path held a byte-identical copy of
 * `lib/ai/cos/cognitiveReasoningPatterns.ts` — a source module pasted over the test. It declared no
 * tests, so `node --test` reported the file as passing and the Vercel gate printed a tick for it.
 * The severity split had been unguarded for as long as that copy sat on main.
 *
 * `releaseSignalSeverity.ts` warns in its own header that it disappeared once before, and that this
 * test plus its gate entry exist so a build fails instead of silently regressing. The gate entry
 * survived; the test did not. `mainWriteDiscipline` now also fails any gated file that registers no
 * tests, so an empty pass cannot happen again.
 */

function file(relative: string): string {
  return fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
}

test('the production failure: retrieval underperformance alone never fails a turn closed', () => {
  // A 512-H100 migration cost question was answered correctly and killed twice by this signal.
  assert.equal(isBlockingReleaseSignal('relevant_learned_evidence_not_used'), false)
  assert.deepEqual(blockingReleaseSignals(['relevant_learned_evidence_not_used']), [])
  assert.deepEqual(advisoryReleaseSignals(['relevant_learned_evidence_not_used']),
    ['relevant_learned_evidence_not_used'])
})

test('signals about the answer itself still block', () => {
  const blocking = [
    'unsupported_commercial_certainty',
    'invented_numeric_limit',
    'fabricated_timeline',
    'unstated_legal_conclusion',
    'unstated_security_framework',
  ]
  for (const signal of blocking) assert.equal(isBlockingReleaseSignal(signal), true, signal)
  assert.deepEqual(blockingReleaseSignals(blocking), blocking)
  assert.deepEqual(advisoryReleaseSignals(blocking), [])
})

test('an unknown signal blocks, because severity is an allowlist and not a guess', () => {
  assert.equal(isBlockingReleaseSignal('some_signal_added_next_month'), true)
})

test('a mixed set is split, and one advisory signal cannot rescue a blocking one', () => {
  const mixed = ['relevant_learned_evidence_not_used', 'invented_numeric_limit']
  assert.deepEqual(blockingReleaseSignals(mixed), ['invented_numeric_limit'])
  assert.deepEqual(advisoryReleaseSignals(mixed), ['relevant_learned_evidence_not_used'])
})

test('order and duplicates are preserved, so the reason string reports what was found', () => {
  const signals = ['invented_numeric_limit', 'relevant_learned_evidence_not_used', 'invented_numeric_limit']
  assert.deepEqual(blockingReleaseSignals(signals), ['invented_numeric_limit', 'invented_numeric_limit'])
})

test('padding and junk cannot smuggle an advisory signal past the comparison', () => {
  assert.equal(isBlockingReleaseSignal('  relevant_learned_evidence_not_used  '), false)
  assert.equal(isBlockingReleaseSignal('RELEVANT_LEARNED_EVIDENCE_NOT_USED'), true)
  assert.equal(isBlockingReleaseSignal('relevant_learned_evidence_not_used_extra'), true)
  for (const value of ['', '   ', null, undefined]) {
    assert.equal(isBlockingReleaseSignal(value as never), true, String(value))
  }
  assert.deepEqual(blockingReleaseSignals([]), [])
})

test('the advisory list stays deliberately narrow', () => {
  // Widening it is a decision about what may reach a reader unchecked, never an incidental edit.
  assert.deepEqual([...ADVISORY_RELEASE_SIGNALS], ['relevant_learned_evidence_not_used'])
})

test('the enterprise release gate consumes the split rather than failing on any signal', () => {
  const gate = file('lib/ai/cos/cosFirstAnswerEnterprise.ts')
  assert.match(gate, /import \{ blockingReleaseSignals, advisoryReleaseSignals \} from '\.\/releaseSignalSeverity\.ts'/)
  const blocking = gate.indexOf('const remainingBlocking = blockingReleaseSignals(remainingSignals)')
  const rejection = gate.indexOf('Executive answer release rejected')
  const advisory = gate.indexOf('const remainingAdvisory = advisoryReleaseSignals(remainingSignals)')
  assert.ok(blocking > 0 && rejection > blocking, 'rejection must be decided from blocking signals only')
  assert.ok(advisory > rejection, 'advisory signals are handled after the rejection decision')
  assert.match(gate.slice(advisory), /console\.warn/, 'advisory signals must be recorded, not discarded')
})

test('the public claim gate is filtered through the same severity rule', () => {
  const core = file('lib/ai/cos/cosFirstAnswerCore.ts')
  assert.match(core, /import \{ blockingReleaseSignals \} from '\.\/releaseSignalSeverity\.ts'/)
  // Real call sites only: the import line and the prose comment above them name the function too.
  const calls = core.split('\n')
    .filter(line => /executiveDecisionUnsupportedClaims\(\s*\w/.test(line) && !line.trim().startsWith('//'))
  assert.ok(calls.length >= 2, `expected the claim-gate call sites, found ${calls.length}`)
  for (const line of calls) {
    assert.match(line, /blockingReleaseSignals\(\s*executiveDecisionUnsupportedClaims\(/,
      `unsupported-claim signals must pass through the severity rule: ${line.trim()}`)
  }
})

test('this file is a test, not a module pasted over one', () => {
  const self = file('tests/releaseSignalSeverity.node.test.ts')
  assert.match(self, /^\/\/ saas\/tests\/releaseSignalSeverity\.node\.test\.ts$/m)
  assert.match(self, /from 'node:test'/)
  // Split so this test does not contain the literal it searches for.
  assert.ok(!self.includes(`Cognitive${'ReasoningTriggerKind'}`), 'the pasted module is back')
})
