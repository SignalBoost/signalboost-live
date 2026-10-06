// saas/tests/holdoutExamComputationRule.node.test.ts
//
// Production 2026-10-05: 23 artifacts could not get their holdout exam written; 18 were Quantum Computing, all refused
// as `computation_ask` because the rule matched the topic word "computing" (and "computer", "derivatives", "derived").
// The rule now refuses a REQUEST to calculate and nothing else. Every other quality rule is unchanged.
import assert from 'node:assert/strict'
import test from 'node:test'
import { holdoutExamItemRejection } from '../lib/ai/cos/cosUniversityHoldoutExamItems.ts'

const item = (question: string, answer = 'Decoherence; the measured coherence time settles it.') => `QUESTION: ${question}\nANSWER KEY: ${answer}`

test('topic words are no longer mistaken for a calculation request', () => {
  for (const question of [
    'In a quantum computing system whose qubits lose phase information after a few microseconds, what effect limits circuit depth, and what measurement would settle it?',
    'Which effect makes a shared computer lab account a security weakness, and what evidence would show it?',
    'What computational trade-off does a caching layer make, and what metric settles whether it pays off?',
    'What risk does an unhedged derivatives position add to a bank, and what disclosure would reveal it?',
    'A forecast derived from last year alone ignores seasonality; what error does this invite, and what data would settle it?',
  ]) {
    assert.equal(holdoutExamItemRejection(item(question)), null, question)
  }
})

test('an actual request to calculate is still refused', () => {
  for (const question of [
    'Calculate the expected loss on a portfolio with a 2% default rate and $5M exposure. What is it?',
    'Compute the reorder point for a store with demand of 20 units per day and a 7 day lead time. What is it?',
    'Derive the break-even volume for fixed costs of $40,000 and a $8 unit margin. What is it?',
    'Work out the payback period of a $100,000 project returning $25,000 a year. What is it?',
    'Solve for the interest rate that doubles an investment in 6 years. What is it?',
    'Evaluate the formula for compound interest at 5% over 3 years on $1,000. What is the value?',
    'What does a team calculating cycle time from averages alone get wrong, and which figure must it compute instead?',
  ]) {
    assert.equal(holdoutExamItemRejection(item(question, '$100,000.')), 'computation_ask', question)
  }
})
// end of saas/tests/holdoutExamComputationRule.node.test.ts (if this line is missing, the paste was cut short)
