// saas/tests/cosAnswerPolicyCore.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { QUANTITATIVE_ANSWER_POLICY, quantitativeAnswerPolicyText } from '../lib/ai/cos/cosAnswerPolicyCore.ts'

test('both reasoner prompts include the shared policy', () => {
  // The whole point of the module: one policy, both channels. If a future edit removes it from
  // either prompt, the two surfaces silently drift apart again — which is the defect this fixes.
  const publicPath = readFileSync('lib/ai/cos/cosFirstAnswer.ts', 'utf8')
  const ownerPath = readFileSync('lib/ai/cos/cosFirstAnswerEnterprise.ts', 'utf8')
  for (const [name, source] of [['public', publicPath], ['owner', ownerPath]] as const) {
    assert.match(source, /import \{ QUANTITATIVE_ANSWER_POLICY \}/, `${name} import`)
    assert.match(source, /\.\.\.QUANTITATIVE_ANSWER_POLICY,/, `${name} splice`)
  }
})

test('the policy is spliced into the public ANSWER prompt, not only the repair prompt', () => {
  const source = readFileSync('lib/ai/cos/cosFirstAnswer.ts', 'utf8')
  const spliceAt = source.indexOf('...QUANTITATIVE_ANSWER_POLICY,')
  const repairAt = source.indexOf('You are COS repairing a public generic-business answer')
  assert.ok(spliceAt > 0 && repairAt > 0)
  assert.ok(spliceAt < repairAt, 'policy must appear in the primary public prompt')
})

test('the rules that were validated in production are present', () => {
  const text = quantitativeAnswerPolicyText()
  assert.match(text, /labelled assumptions/i)          // fill gaps, do not refuse
  assert.match(text, /decomposition before the total/i) // show the components
  assert.match(text, /reconcile/i)                      // derived vs supplied disagreement
  assert.match(text, /invert the problem/i)             // solve for the required ratio
  assert.match(text, /reachable at all/i)               // feasibility floor
  assert.match(text, /scope it was written/i)           // constraint scope discipline
  assert.match(text, /one-time cost/i)                  // dimensional check
})

test('the policy forbids narrating internal machinery to the reader', () => {
  const text = quantitativeAnswerPolicyText()
  assert.match(text, /Never discuss retrieval, evidence selection, internal subsystems/i)
  assert.match(text, /first person/i)
  assert.match(text, /restating the question/i)
})

test('the policy itself names no internal component, model or vendor', () => {
  // It ships inside a prompt used on the public surface. It must not teach the model any
  // internal vocabulary it could then repeat.
  const text = quantitativeAnswerPolicyText()
  assert.ok(!/qwen|deepinfra|runpod|supabase|vercel|openai|anthropic/i.test(text))
  assert.ok(!/COS_REASONER|cos_campaign|process\.env/i.test(text))
})

test('the policy carries no domain constants — those belong in the corpus', () => {
  // A prompt cannot hold a reference library. Bytes-per-parameter, heat transfer coefficients and
  // the 80% continuous-load rule live in learned corpus documents, not here.
  const text = quantitativeAnswerPolicyText()
  assert.ok(!/bytes per (?:param|element)|4\.19|0\.0698|80%/i.test(text))
})

test('the policy is a non-empty array of strings and joins cleanly', () => {
  assert.ok(Array.isArray(QUANTITATIVE_ANSWER_POLICY))
  assert.ok(QUANTITATIVE_ANSWER_POLICY.length >= 15)
  for (const line of QUANTITATIVE_ANSWER_POLICY) assert.equal(typeof line, 'string')
  assert.ok(quantitativeAnswerPolicyText().includes('\n'))
})
