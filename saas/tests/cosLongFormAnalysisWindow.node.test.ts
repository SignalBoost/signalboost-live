// saas/tests/cosLongFormAnalysisWindow.node.test.ts
// Production 2026-10-25: an 8-task incident analysis ("1. List every plausible root cause. 2. Rank causes by
// probability. …") hit the 20 s / 2,000-token one-pass chat answer limit; the cut-off answer was discarded, the
// 9 s / 1,400-token last-chance retry failed too, and the owner got a canned "I need more readings" sentence.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { registerHooks } from 'node:module'

// The worker and answer modules use the app's bundler resolution: the '@/' alias and extensionless paths.
const root = new URL('../', import.meta.url)
registerHooks({
  resolve(specifier, context, next) {
    const base = specifier.startsWith('@/') ? new URL(specifier.slice(2), root).href : specifier
    try { return next(base, context) } catch (error) {
      for (const candidate of [`${base}.ts`, `${base}/index.ts`, `${base}.js`]) {
        try { return next(candidate, context) } catch { /* try the next file form */ }
      }
      throw error
    }
  },
})
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
  assert.match(enterprise, /isLongFormAnalysisRequest\(input\.prompt\)\s*\?\s*\{ longForm:true, maxTokens:longFormReasonerMaxTokens\(\) \}/)
  assert.match(primary, /const longForm=isLongFormAnalysisRequest\(input\)/)
  assert.match(primary, /longForm\?\{longForm:true,maxTokens:longFormReasonerMaxTokens\(\)\}:\{maxTokens:1400,timeoutMs:9_000\}/)
  // The window stays inside the browser turn's model deadline, so the turn still always answers.
  const browser = readFileSync(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  const deadline = Number(/const BROWSER_TURN_MODEL_DEADLINE_MS = ([\d_]+)/.exec(browser)?.[1].replace(/_/g, ''))
  assert.ok(120_000 < deadline, `long-form window must fit the ${deadline} ms turn deadline`)
})

// Codex on #4879: the flag must survive the reasoning control plane, and the room never exceeds the global ceiling.
test('the long-form flag reaches the model call a reasoning worker makes', async () => {
  const { toLocalModelCallArgs } = await import('../lib/ai/cos/cosReasoningWorkers.ts')
  const args = toLocalModelCallArgs({ prompt: incident, maxTokens: 4000, longForm: true, usageContext: { feature: 'cos_interactive_answer' } }, 'critic')
  assert.equal(args.longForm, true)
  assert.equal(args.maxTokens, 4000)
  assert.equal(toLocalModelCallArgs({ prompt: 'hi', maxTokens: 500 }, 'primary').longForm, undefined)
})

test('long-form output room stays within the configured global token ceiling', async () => {
  const prior = process.env.COS_REASONER_MAX_TOKENS
  const { longFormReasonerMaxTokens } = await import('../lib/ai/cos/cosFirstAnswerEnterprise.ts')
  try {
    delete process.env.COS_REASONER_MAX_TOKENS
    assert.equal(longFormReasonerMaxTokens(), 4000)
    process.env.COS_REASONER_MAX_TOKENS = '1000'
    assert.equal(longFormReasonerMaxTokens(), 1000)
  } finally {
    if (prior === undefined) delete process.env.COS_REASONER_MAX_TOKENS
    else process.env.COS_REASONER_MAX_TOKENS = prior
  }
})
