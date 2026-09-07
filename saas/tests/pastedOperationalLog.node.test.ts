// saas/tests/pastedOperationalLog.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  analyzeOperationalLog,
  compactOperationalLogForRepair,
  ensureOperationalLogRepairHandoff,
  hasExplicitOperationalLogRepairIntent,
  isExplicitOperationalLogRepairRequest,
  isOperationalLogEvidence,
  isPastedOperationalLog,
  operationalLogRepairHandoff,
  operationalLogReply,
} from '../lib/ai/cos/pastedOperationalLog.ts'

test('recognizes a pasted Vercel build log as passive operational evidence', () => {
  const log = [
    '02:18:55.460 Running build in Cleveland, USA',
    '02:18:57.633 Running vercel build',
    'Vercel CLI 59.3.0',
    'Running node scripts/vercel-cos-gates.mjs && npm run prebuild && next build',
  ].join('\n')
  assert.equal(isOperationalLogEvidence(log), true)
  assert.equal(isPastedOperationalLog(log), true)
  assert.equal(isPastedOperationalLog('Fix the add function in src/math.js.'), false)
})

test('recognizes a clipped middle section of Vercel test output after the composer loses the build header', () => {
  const clipped = [
    '10:52:09.206 ✔ History validates the conversation, reports database failures, and disables caching (1.809029ms)',
    '10:52:09.206 (node:136) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///vercel/path0/saas/tests/assistantSourceFileBoundary.node.test.ts is not specified',
    '10:52:09.217 Reparsing as ES Module because module syntax was detected. This incurs a performance overhead.',
    '10:52:09.218 ✔ gateway HTML is never exposed as an assistant answer (2.242796ms)',
    '10:52:09.218 ✔ technical provenance copy remains bounded (0.320000ms)',
  ].join('\n')
  assert.equal(isOperationalLogEvidence(clipped), true)
  assert.equal(isPastedOperationalLog(clipped), true)
  assert.equal(isOperationalLogEvidence('Meeting notes: 10:52:09.206 we discussed technical provenance and PDF exports.'), false)
})

test('legacy repair-intent helpers do not manufacture log evidence', () => {
  assert.equal(hasExplicitOperationalLogRepairIntent('please debug this'), true)
  assert.equal(hasExplicitOperationalLogRepairIntent('fix it'), true)
  assert.equal(isOperationalLogEvidence('please debug this'), false)
  assert.equal(isExplicitOperationalLogRepairRequest('please debug this'), false)
})

test('log evidence stays log evidence even when repair words appear inside it', () => {
  const log = [
    'Please debug this build.',
    '15:27:17.225 Running "vercel build"',
    'Error: Command "npm test" exited with 1',
  ].join('\n')
  assert.equal(isOperationalLogEvidence(log), true)
  assert.equal(isExplicitOperationalLogRepairRequest(log), true)
  assert.equal(isPastedOperationalLog(log), true)

  const passive = log.replace('Please debug this build.\n', '')
  assert.equal(isExplicitOperationalLogRepairRequest(passive), false)
  assert.equal(isPastedOperationalLog(passive), true)
})

test('failure words inside the log do not manufacture explicit repair authority', () => {
  const log = [
    '15:27:17.225 Running "vercel build"',
    '16:07:21.324 ✖ repair workflow does not fail closed',
    'Error: Command "npm test" exited with 1',
  ].join('\n')
  assert.equal(isExplicitOperationalLogRepairRequest(log), false)
  assert.equal(isPastedOperationalLog(log), true)
})

test('huge repair evidence preserves immutable build identity and the final failure inside the durable objective cap', () => {
  const header = '00:10:42.552 Cloning github.com/SignalBoost/signalboost-live (Branch: fix/cos-image-generation, Commit: dfb50b4)\n'
  const middle = '00:10:50.000 ✔ unrelated passing test\n'.repeat(7_000)
  const tail = [
    '00:11:03.682 ✖ failing tests:',
    '00:11:03.689 ✖ contextual interpretation is handled before the mature retrieval pipeline',
    '00:11:03.742 Error: Command "node scripts/vercel-cos-gates.mjs && npm run prebuild && next build" exited with 1',
  ].join('\n')
  const original = `${header}${middle}${tail}`
  assert.ok(original.length > 250_000)

  const compacted = compactOperationalLogForRepair(original)
  assert.ok(compacted.length <= 60_000)
  assert.match(compacted, /Branch: fix\/cos-image-generation, Commit: dfb50b4/)
  assert.match(compacted, /contextual interpretation is handled before the mature retrieval pipeline/)
  assert.match(compacted, /exited with 1/)
  assert.match(compacted, /middle omitted by SignalBoost transport/)
  assert.equal(isOperationalLogEvidence(compacted), true)
})

test('reports a final test failure and offers an explicit repair handoff without demanding repository source', () => {
  const log = [
    '15:27:16.225 Cloning github.com/SignalBoost/signalboost-live (Branch: feat/demo, Commit: 1234567)',
    '15:27:17.225 Running "vercel build"',
    '16:07:21.324 ✖ both answer paths resolve markers before anything else sees the text',
    'Error: Command "node scripts/vercel-cos-gates.mjs && npm run prebuild && next build" exited with 1',
  ].join('\n')
  const analysis = analyzeOperationalLog(log)
  const reply = operationalLogReply(log)
  assert.equal(analysis.failed, true)
  assert.equal(analysis.exitCode, 1)
  assert.equal(analysis.testFailures.length, 1)
  assert.match(reply, /This Vercel build failed/)
  assert.match(reply, /both answer paths resolve markers/i)
  assert.match(reply, /I can repair this\. Want me to\?/)
  assert.match(reply, /passive diagnostic evidence, not a repair request/i)
  assert.doesNotMatch(reply, /attach the affected source file/i)
  assert.doesNotMatch(reply, /No code was changed from the log alone/i)
})

test('an incomplete build excerpt asks for missing failure evidence, not repository source', () => {
  const log = [
    '22:44:23.200 Running vercel build',
    'Vercel CLI 59.3.0',
    'GET 202 /api/builder',
  ].join('\n')
  const reply = operationalLogReply(log)
  assert.match(reply, /does not include a failing assertion or a non-zero final command/i)
  assert.match(reply, /No code was changed/i)
  assert.match(reply, /Paste the final error or ✖ assertion/i)
  assert.match(reply, /I can repair this\. Want me to\?/)
  assert.doesNotMatch(reply, /attach the affected source file/i)
  assert.doesNotMatch(reply, /not editable source code|not a request to portray anyone/i)
})

test('host handoff is deterministic after a richer neural diagnosis and localized across all five platform languages', () => {
  const neural = 'The build has one isolated assertion failure in the contextual-interpretation ordering gate.'
  const English = ensureOperationalLogRepairHandoff(neural, 'en')
  assert.match(English, /I can repair this\. Want me to\?/)
  assert.equal(ensureOperationalLogRepairHandoff(English, 'en'), English)

  const localized = ['en', 'es', 'pt', 'pl', 'ru'].map(locale => operationalLogRepairHandoff(locale))
  assert.equal(new Set(localized).size, 5)
  for (const handoff of localized) {
    assert.ok(handoff.trim().length > 0 && handoff.trim().endsWith('?'), handoff)
  }
})

test('the live operational diagnostic wraps both fallback and neural success with the host-owned handoff', () => {
  const diagnostic = readFileSync(new URL('../lib/ai/cos/operationalLogDiagnostic.ts', import.meta.url), 'utf8')
  assert.match(diagnostic, /const fallback = ensureOperationalLogRepairHandoff\(operationalLogReply\(input\.log\), input\.language\)/)
  assert.match(diagnostic, /reply: ensureOperationalLogRepairHandoff\(reply, input\.language\)/)
})
