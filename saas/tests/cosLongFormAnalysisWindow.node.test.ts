// saas/tests/cosLongFormAnalysisWindow.node.test.ts
// Production 2026-10-25: an 8-task incident analysis ("1. List every plausible root cause. 2. Rank causes by
// probability. …") hit the 20 s / 2,000-token one-pass chat answer limit; the cut-off answer was discarded, the
// 9 s / 1,400-token last-chance retry failed too, and the owner got a canned "I need more readings" sentence.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isLongFormAnalysisRequest } from '../lib/ai/cos/cosReasoningRolePolicy.ts'

const incident = readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8')

test('multi-part analysis requests are recognized; ordinary questions are not', () => {
  assert.equal(isLongFormAnalysisRequest(incident), true)
  assert.equal(isLongFormAnalysisRequest([
    'Phantom writes in a distributed queue worker.',
    'Identify root cause — Determine which subsystem is responsible.',
    'Trace job lifecycle — Reconstruct the full lifecycle of a job.',
    'Detect race conditions — Analyze lock timing vs job execution time.',
    'Recommend fixes — Provide a prioritized list of corrections.',
  ].join('\n')), true)
  for (const prompt of [
    'What is the capital of Paraguay?',
    'Explain how Kafka consumer groups work.',
    'List three colors.\nThanks!',
    'Rewrite this email to sound friendlier: Hi team, the deploy is late.',
  ]) assert.equal(isLongFormAnalysisRequest(prompt), false, prompt)
})

test('the main answer and the last-chance retry get the long-form window for such requests', () => {
  const inference = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  const enterprise = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  const primary = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.match(inference, /export const LONG_FORM_ANSWER_TIMEOUT_MS = 120_000/)
  assert.match(inference, /if \(args\.longForm === true\) return Math\.min\(configTimeoutMs, LONG_FORM_ANSWER_TIMEOUT_MS\)/)
  assert.match(enterprise, /isLongFormAnalysisRequest\(input\.prompt\)\s*\?\s*\{ longForm:true, maxTokens:Math\.max\(interactiveReasonerMaxTokens\(\), LONG_FORM_ANSWER_MAX_TOKENS\) \}/)
  assert.match(primary, /const longForm=isLongFormAnalysisRequest\(input\)/)
  assert.match(primary, /longForm\?\{longForm:true,maxTokens:LONG_FORM_ANSWER_MAX_TOKENS\}:\{maxTokens:1400,timeoutMs:9_000\}/)
  // The window stays inside the browser turn's model deadline, so the turn still always answers.
  const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const deadline = Number(/const BROWSER_TURN_MODEL_DEADLINE_MS = ([\d_]+)/.exec(browser)?.[1].replace(/_/g, ''))
  assert.ok(120_000 < deadline, `long-form window must fit the ${deadline} ms turn deadline`)
})
