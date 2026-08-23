import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { detectUserSuppliedPremises, userSuppliedPremiseLine } from '../lib/ai/cos/userSuppliedPremises.ts'

const VERBATIM = "Context Record A (dated 60 days ago) states: 'All enterprise vendor contracts over $50k require CFO signature and a 3-year amortization schedule.' Context Record B (dated 3 days ago) states: 'Effective immediately: To preserve cash flexibility, all new vendor contracts are capped at 12-month terms; approvals above $25k are delegated to the VP of Finance.' Vendor X presents a $45k, 2-year software renewal. Formulate the approval recommendation."

test('recognizes both labelled user-supplied records', () => {
  const result = detectUserSuppliedPremises(VERBATIM)
  assert.equal(result.present, true)
  assert.equal(result.labelledCount, 2)
})

test('does not mislabel ordinary prompts as premises', () => {
  for (const prompt of [
    'who is the current president of France?',
    'Design a 90-day phased optimization strategy that balances latency, model performance, and unit economics across our inference stack.',
    'Our margins fell from 74% to 61% this quarter and the CFO wants a plan by Friday to bring them back up.',
  ]) assert.equal(detectUserSuppliedPremises(prompt).present, false, prompt)
})

test('recognizes framed quoted policy text', () => {
  const prompt = 'Given the following policy text, decide whether the renewal qualifies for the reduced rate.\n> All vendor agreements executed after the first of the quarter are subject to the revised schedule and require dual approval.'
  assert.equal(detectUserSuppliedPremises(prompt).present, true)
})

test('labels user premises as factual basis rather than retrieval', () => {
  const line = userSuppliedPremiseLine(detectUserSuppliedPremises(VERBATIM))!
  assert.match(line, /User-Supplied Premises : USED — 2 labelled premises/)
  assert.match(line, /factual basis/)
  assert.match(line, /rather than retrieving them/)
})

test('wires user premises through answer and report provenance', () => {
  const answerPath = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(answerPath, /detectUserSuppliedPremises\(input\.prompt\)/)
  assert.match(answerPath, /userSuppliedPremises\?:\{present:boolean; labelledCount:number; signals:string\[\]\}/)

  const orchestration = readFileSync(new URL('../lib/ai/cos/cosOrchestration.ts', import.meta.url), 'utf8')
  assert.match(orchestration, /provenance\.user_supplied_premises = \{/)

  const live = readFileSync(new URL('../lib/ai/cos/cosOrchestrationLive.ts', import.meta.url), 'utf8')
  assert.match(live, /User-Supplied Premises/)
  assert.match(live, /not retrieved from any store/)
})
