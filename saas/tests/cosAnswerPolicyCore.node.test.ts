// saas/tests/cosAnswerPolicyCore.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { QUANTITATIVE_ANSWER_POLICY, quantitativeAnswerPolicyText } from '../lib/ai/cos/cosAnswerPolicyCore.ts'

const PUBLIC_PIPELINE = 'lib/ai/cos/cosFirstAnswerCore.ts'
const OWNER_PIPELINE = 'lib/ai/cos/cosFirstAnswerEnterprise.ts'

test('both reasoner prompts include the shared policy', () => {
  const publicPath = readFileSync(PUBLIC_PIPELINE, 'utf8')
  const ownerPath = readFileSync(OWNER_PIPELINE, 'utf8')
  for (const [name, source] of [['public', publicPath], ['owner', ownerPath]] as const) {
    assert.match(source, /import \{ QUANTITATIVE_ANSWER_POLICY \}/, `${name} import`)
    assert.match(source, /\.\.\.QUANTITATIVE_ANSWER_POLICY,/, `${name} splice`)
  }
})

test('the policy is spliced into the public ANSWER prompt, not only the repair prompt', () => {
  const source = readFileSync(PUBLIC_PIPELINE, 'utf8')
  const spliceAt = source.indexOf('...QUANTITATIVE_ANSWER_POLICY,')
  const repairAt = source.indexOf('You are COS repairing a public generic-business answer')
  assert.ok(spliceAt > 0 && repairAt > 0)
  assert.ok(spliceAt < repairAt, 'policy must appear in the primary public prompt')
})

test('the rules that were validated in production are present', () => {
  const text = quantitativeAnswerPolicyText()
  assert.match(text, /labelled assumptions/i)
  assert.match(text, /decomposition before the total/i)
  assert.match(text, /reconcile/i)
  assert.match(text, /invert the problem/i)
  assert.match(text, /reachable at all/i)
  assert.match(text, /scope it was written/i)
  assert.match(text, /one-time cost/i)
})

test('the policy forbids narrating internal machinery to the reader', () => {
  const text = quantitativeAnswerPolicyText()
  assert.match(text, /Never discuss retrieval, evidence selection, internal subsystems/i)
  assert.match(text, /first person/i)
  assert.match(text, /restating the question/i)
})

test('the policy itself names no internal component, model or vendor', () => {
  const text = quantitativeAnswerPolicyText()
  assert.ok(!/qwen|deepinfra|runpod|supabase|vercel|openai|anthropic/i.test(text))
  assert.ok(!/COS_REASONER|cos_campaign|process\.env/i.test(text))
})

test('the policy carries the pinned constants exactly once', () => {
  const text = quantitativeAnswerPolicyText()
  assert.match(text, /REFERENCE CONSTANTS/)
  assert.equal(text.split('REFERENCE CONSTANTS').length - 1, 1, 'constants must appear exactly once')

  for (const path of [PUBLIC_PIPELINE, OWNER_PIPELINE]) {
    const source = readFileSync(path, 'utf8')
    assert.ok(!/\.\.\.ENGINEERING_CONSTANTS,/.test(source), `${path} must not splice the constants directly — they arrive via QUANTITATIVE_ANSWER_POLICY`)
  }
})

test('the policy is a non-empty array of strings and joins cleanly', () => {
  assert.ok(Array.isArray(QUANTITATIVE_ANSWER_POLICY))
  assert.ok(QUANTITATIVE_ANSWER_POLICY.length >= 15)
  for (const line of QUANTITATIVE_ANSWER_POLICY) assert.equal(typeof line, 'string')
  assert.ok(quantitativeAnswerPolicyText().includes('\n'))
})

test('the three quantity classes are defined, each with its own obligation', () => {
  const text = quantitativeAnswerPolicyText()
  assert.match(text, /GIVEN — stated in the request/)
  assert.match(text, /STANDARD — a published specification/)
  assert.match(text, /SITUATIONAL — knowable only from the reader/)
})

test('a standard quantity is supplied, never used as grounds to decline', () => {
  const text = quantitativeAnswerPolicyText()
  assert.match(text, /SUPPLY IT, label it as an assumption/)
  assert.match(text, /Never decline because a STANDARD quantity was not stated/)
})

test('a missing situational quantity yields a formula and a worked example, not a refusal', () => {
  const text = quantitativeAnswerPolicyText()
  assert.match(text, /give the result as a formula in that quantity/)
  assert.match(text, /work a labelled example through/)
  assert.match(text, /A page of framework with no number in it is a failure/)
})

test('the classes name the kinds of figure that caused the production failures', () => {
  const text = quantitativeAnswerPolicyText()
  assert.match(text, /device power ratings/)
  assert.match(text, /specific heat of water/)
  assert.match(text, /byte widths of numeric formats/)
  assert.match(text, /how long their job runs/)
  assert.match(text, /negotiated rate/)
})

test('the shared policy requires domain-general evidence reasoning instead of semantic topic templates', () => {
  const text = quantitativeAnswerPolicyText()
  assert.match(text, /EVIDENCE-BASED REASONING/)
  assert.match(text, /proposition the user actually asked/i)
  assert.match(text, /construct, population, denominator, time window/i)
  assert.match(text, /Distinguish observation from explanation/i)
  assert.match(text, /Synthesize the minimum set of strong, relevant evidence/i)
  assert.match(text, /Open with yes or no only when the question names one operationally unambiguous factual proposition/i)
  assert.match(text, /do not open with yes or no/i)
  assert.match(text, /may be one candidate factor/i)
  assert.doesNotMatch(text, /pay gap|matched-pay|matched-wage|gender identity|biological sex|reproductive sex|racist|equal work/i)
})
