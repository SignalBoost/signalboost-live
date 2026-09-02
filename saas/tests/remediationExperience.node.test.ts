import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeRemediationClass, remediationExperiencePrompt, summarizeRemediationExperience } from '../self-healing-host/remediation-experience-pure.ts'
import { formatBuilderOperatorRepairReply } from '../lib/builder/operator-narration.ts'
import { isOperatorRepairRequest, operatorProgressMessage } from '../lib/ai/cos/operator-progress.ts'

const match = { provider: 'signalboost-platform', environment: 'production', incidentClass: nativeRemediationClass({ source: 'cron', nativeProbe: 'api' }) }

test('only repeated clean objective outcomes become remediation suggestions', () => {
  const experience = summarizeRemediationExperience([
    { outcome_status: 'success', facts: { ...match, action: 'restart-worker' } },
    { outcome_status: 'success', facts: { ...match, action: 'restart-worker' } },
    { outcome_status: 'failure', facts: { ...match, action: 'rotate-key' } },
    { outcome_status: 'success', facts: { ...match, action: 'rotate-key' } },
    { outcome_status: 'success', facts: { ...match, action: 'unrelated-action', incidentClass: 'cron:storage' } },
  ], match)

  assert.deepEqual(experience, [{ action: 'restart-worker', successes: 2, failures: 0 }])
  assert.match(remediationExperiencePrompt(experience), /does not grant approval/)
})

test('native remediation classes are bounded and stable', () => {
  assert.equal(nativeRemediationClass({ source: 'cron', nativeProbe: 'api latency' }), 'cron:api_latency')
})

test('verified Builder repairs narrate found, diagnosed, fixed, and verified from tool evidence', () => {
  const reply = formatBuilderOperatorRepairReply({
    ok: true,
    answer: 'Repair completed.',
    trace: [
      { round: 1, toolId: 'run', ok: false, input: { command: 'node test.js' }, failureClass: 'test' },
      { round: 2, toolId: 'edit_file', ok: true, input: { path: 'src/app.js' } },
      { round: 3, toolId: 'run', ok: true, input: { command: 'node test.js' }, output: { exitCode: 0 } },
    ],
  })

  assert.match(reply, /^Found —/)
  assert.match(reply, /\nDiagnosed —/)
  assert.match(reply, /\nFixed — updated `src\/app\.js`\./)
  assert.match(reply, /\nVerified — `node test\.js` passed with exit code 0\./)
  assert.doesNotMatch(reply, /Builder stopped|builder_/)
})

test('failed Builder repairs stay active and actionable without presenting an internal error as the answer', () => {
  const reply = formatBuilderOperatorRepairReply({
    ok: false,
    error: 'builder_debug_verification_failed',
    trace: [
      { round: 1, toolId: 'run', ok: false, input: { command: 'node test.js' }, failureClass: 'test' },
      { round: 2, toolId: 'edit_file', ok: true, input: { path: 'src/app.js' } },
      { round: 3, toolId: 'run', ok: false, input: { command: 'node test.js' }, failureClass: 'test', remediation: 'Inspect the remaining assertion and make the next targeted repair.' },
    ],
  })

  assert.match(reply, /^Found —/)
  assert.match(reply, /\nDiagnosed —/)
  assert.match(reply, /\nFixing — I changed `src\/app\.js`, but the proof has not passed yet\./)
  assert.match(reply, /\nVerification — not passed yet\. I am not calling this fixed\./)
  assert.match(reply, /\nNext action — Inspect the remaining assertion/)
  assert.doesNotMatch(reply, /COS Builder stopped|builder_debug_verification_failed/)
})

test('Concierge and COS repair progress use the shared operator arc without premature verification', () => {
  assert.equal(isOperatorRepairRequest({ objective: 'Fix this failing checkout test.' }), true)
  assert.equal(isOperatorRepairRequest({ messages: [{ role: 'user', content: 'Please debug this broken function.' }] }), true)
  assert.equal(isOperatorRepairRequest({ messages: [{ role: 'user', content: 'Explain what this function does.' }] }), false)

  assert.match(operatorProgressMessage({ stage: 'accepted', target: 'cos', builder: false }), /^Found —/)
  assert.match(operatorProgressMessage({ stage: 'diagnosing', target: 'concierge', builder: true }), /^Diagnosing —/)
  assert.match(operatorProgressMessage({ stage: 'fixing', target: 'concierge', builder: true }), /^Fixing —/)
  assert.match(operatorProgressMessage({ stage: 'verified', target: 'cos', builder: true }), /^Verified —/)
  assert.match(operatorProgressMessage({ stage: 'blocked', target: 'cos', builder: true }), /Verification is not complete yet/)
})
