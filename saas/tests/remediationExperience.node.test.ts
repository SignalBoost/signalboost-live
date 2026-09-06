import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { nativeRemediationClass, remediationExperiencePrompt, summarizeRemediationExperience } from '../self-healing-host/remediation-experience-pure.ts'
import { formatBuilderOperatorRepairReply } from '../lib/builder/operator-narration.ts'
import { isOperatorRepairRequest, isVerifiedBuilderTerminal, operatorProgressMessage } from '../lib/ai/cos/operator-progress.ts'

const match = { provider: 'signalboost-platform', environment: 'production', incidentClass: nativeRemediationClass({ source: 'cron', nativeProbe: 'api' }) }
const builderJobRunner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
const progressClient = readFileSync(new URL('../lib/ai/cos/agentProgressClient.ts', import.meta.url), 'utf8')

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

test('verified Builder repairs narrate found, diagnosed, fixed, and verified from sanitized tool evidence', () => {
  const reply = formatBuilderOperatorRepairReply({
    ok: true,
    answer: 'Repair completed.',
    trace: [
      { round: 1, toolId: 'run', ok: false, command: 'node test.js', failureClass: 'test' },
      { round: 2, toolId: 'edit_file', ok: true, path: 'src/app.js' },
      { round: 3, toolId: 'run', ok: true, command: 'node test.js', exitCode: 0 },
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
      { round: 1, toolId: 'run', ok: false, command: 'node test.js', failureClass: 'test' },
      { round: 2, toolId: 'edit_file', ok: true, path: 'src/app.js' },
      { round: 3, toolId: 'run', ok: false, command: 'node test.js', failureClass: 'test', remediation: 'Inspect the remaining assertion and make the next targeted repair.' },
    ],
  })

  assert.match(reply, /^Found —/)
  assert.match(reply, /\nDiagnosed —/)
  assert.match(reply, /\nChanged — updated `src\/app\.js`\./)
  assert.match(reply, /\nVerification — no successful command was recorded\./)
  assert.match(reply, /\nTask status — incomplete/)
  assert.doesNotMatch(reply, /Verified —|passed with exit code 0/)
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

test('durable HTTP 200 is verified only when Builder itself succeeded', () => {
  assert.equal(isVerifiedBuilderTerminal({ status: 'succeeded' }, true), true)
  assert.equal(isVerifiedBuilderTerminal({ status: 'failed' }, true), false)
  assert.equal(isVerifiedBuilderTerminal({ status: 'succeeded', error: 'builder_failure' }, true), false)
  assert.equal(isVerifiedBuilderTerminal({ status: 'succeeded' }, false), false)
  assert.equal(isVerifiedBuilderTerminal({}, true), false)
})

test('runtime repair paths are wired to operator narration instead of raw Builder failure copy', () => {
  assert.match(builderJobRunner, /formatBuilderOperatorRepairReply/)
  assert.match(builderJobRunner, /repairAwareFailureReply/)
  assert.match(builderJobRunner, /isRepairObjective\(job\.objective\)/)
  assert.doesNotMatch(builderJobRunner, /const base = \{[\s\S]{0,120}\binput,\s*\n\s*output,/)
  assert.match(progressClient, /isOperatorRepairRequest\(requestBody\)/)
  assert.match(progressClient, /isVerifiedBuilderTerminal\(data, poll\.ok\)/)
  assert.match(progressClient, /stage: terminalSucceeded \? 'verified' : 'blocked'/)
  assert.doesNotMatch(progressClient, /stage: poll\.ok \? 'verified' : 'blocked'/)
  assert.doesNotMatch(progressClient, /COS Builder job failed/)
})
