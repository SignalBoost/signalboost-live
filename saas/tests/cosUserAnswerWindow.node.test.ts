// saas/tests/cosUserAnswerWindow.node.test.ts
// Production 2026-10-25: the time and room for COS's answer were chosen by guessing the request's kind from its
// wording (edit, simple fact, travel, "analysis with 3+ numbered asks", other). Any request that matched no
// pattern got 20 s / 2,000 tokens; a real answer was cut off, discarded, and the user got a refusal. Every request
// now gets the same answer window, and the model decides how long the answer is.
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

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('the answer window never depends on how the request is worded', () => {
  const enterprise = source('../lib/ai/cos/cosFirstAnswerEnterprise.ts')
  const primary = source('../app/api/cos-primary/route.ts')
  const policy = source('../lib/ai/cos/cosReasoningRolePolicy.ts')
  for (const text of [enterprise, primary, policy]) {
    assert.doesNotMatch(text, /isLongFormAnalysisRequest|longFormReasonerMaxTokens|interactiveReasonerMaxTokens|COS_INTERACTIVE_REASONER_MAX_TOKENS/)
  }
  // The main answer, its release repair, and the last-chance retry all write the user's answer with the same room.
  assert.equal(enterprise.match(/writesUserAnswer:\s*true,\s*\n\s*maxTokens:\s*userAnswerMaxTokens\(\),/g)?.length, 2)
  assert.match(primary, /writesUserAnswer:true,\s*\n\s*maxTokens:userAnswerMaxTokens\(\),/)
  assert.doesNotMatch(primary, /maxTokens:1400,timeoutMs:9_000/)
})

test('the answer window fits inside the browser turn deadline, so the turn still always answers', () => {
  const inference = source('../lib/ai/local-inference.ts')
  assert.match(inference, /export const USER_ANSWER_TIMEOUT_MS = USER_ANSWER_WINDOW_MS/)
  assert.match(inference, /if \(args\.writesUserAnswer === true\) return Math\.min\(configTimeoutMs, USER_ANSWER_TIMEOUT_MS\)/)
  assert.doesNotMatch(inference, /COS_INTERACTIVE_AUTHORING_TIMEOUT_MS|longForm/)
  const browser = source('../app/api/cos-browser/route.ts')
  const deadline = Number(/const BROWSER_TURN_MODEL_DEADLINE_MS = ([\d_]+)/.exec(browser)?.[1].replace(/_/g, ''))
  assert.ok(120_000 < deadline, `answer window must fit the ${deadline} ms turn deadline`)
})

// Codex on #4879: the flag must survive the reasoning control plane.
test('the answer-window flag reaches the model call a reasoning worker makes', async () => {
  const { toLocalModelCallArgs } = await import('../lib/ai/cos/cosReasoningWorkers.ts')
  const args = toLocalModelCallArgs({ prompt: 'Why did checkout latency double after the cache change?', maxTokens: 4000, writesUserAnswer: true, usageContext: { feature: 'cos_interactive_answer' } }, 'critic')
  assert.equal(args.writesUserAnswer, true)
  assert.equal(args.maxTokens, 4000)
  assert.equal(toLocalModelCallArgs({ prompt: 'hi', maxTokens: 500 }, 'primary').writesUserAnswer, undefined)
})

test('answer room is the same for every request and stays within the configured global token ceiling', async () => {
  const prior = process.env.COS_REASONER_MAX_TOKENS
  const { userAnswerMaxTokens } = await import('../lib/ai/cos/cosFirstAnswerEnterprise.ts')
  try {
    delete process.env.COS_REASONER_MAX_TOKENS
    assert.equal(userAnswerMaxTokens(), 4000)
    process.env.COS_REASONER_MAX_TOKENS = '1000'
    assert.equal(userAnswerMaxTokens(), 1000)
  } finally {
    if (prior === undefined) delete process.env.COS_REASONER_MAX_TOKENS
    else process.env.COS_REASONER_MAX_TOKENS = prior
  }
})
