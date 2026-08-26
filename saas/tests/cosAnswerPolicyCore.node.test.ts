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

// ---------------------------------------------------------------------------------------------
// Over-firing refusal (2026-08-26).
// ---------------------------------------------------------------------------------------------

test('the three quantity classes are defined, each with its own obligation', () => {
  // Production: asked to compute a migration break-even, COS returned a framework and asked for
  // "the total power draw of the cluster" — a published device rating it is expected to supply.
  // It did this twice, including immediately after the owner replied "proceed on standard
  // assumptions". One line about labelled assumptions lost the argument against several forceful
  // lines telling it not to assert anything not given, so the rule is now explicit.
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
  // Standard: what it should have supplied.
  assert.match(text, /device power ratings/)
  assert.match(text, /specific heat of water/)
  assert.match(text, /byte widths of numeric formats/)
  // Situational: what it was right to ask for.
  assert.match(text, /how long their job runs/)
  assert.match(text, /negotiated rate/)
})
