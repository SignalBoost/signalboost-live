import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { correctCompoundingArithmetic } from '../lib/ai/cos/compoundingArithmeticCheck.ts'

const VERBATIM = 'Month 1: 96% remaining. Month 2: 92.16% remaining. At 4% monthly churn, by Month 8: ~72.6% remaining. Result: You will lose ~27.4% of your user base in 8 months.'

test('the production compounding error is corrected', () => {
  const { text, corrections } = correctCompoundingArithmetic(VERBATIM)
  assert.equal(corrections.length, 2)
  assert.match(text, /~72\.1% remaining/)
  assert.match(text, /~27\.9% of your user base/)
  assert.match(text, /Month 1: 96% remaining/)
  assert.match(text, /Month 2: 92\.16% remaining/)
})

test('correct figures and unrelated percentages remain untouched', () => {
  for (const value of [
    'At 4% monthly churn, by Month 8: 72.14% remaining.',
    'At 4% monthly churn, you lose 27.86% of your user base in 8 months.',
    'Gross margins declined from 74% to 61% over two quarters.',
  ]) assert.equal(correctCompoundingArithmetic(value).text, value)
})

test('only rounding tolerance is accepted', () => {
  const src = readFileSync(new URL('../lib/ai/cos/compoundingArithmeticCheck.ts', import.meta.url), 'utf8')
  assert.match(src, /const TOLERANCE_POINTS = 0\.1/)
  assert.equal(correctCompoundingArithmetic('At 4% monthly churn, by Month 8: 72.6% remaining.').corrections.length, 1)
})

test('every COS answer path is cleaned', () => {
  const answerPath = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(answerPath, /correctCompoundingArithmetic\(stripInternalEvidenceIds\(answer\)\)\.text/)
  assert.match(answerPath, /cleanAnswerText\(payload\.reply\)/)
  assert.match(answerPath, /cleanAnswerText\(cached\.reply\)/)
  assert.match(answerPath, /cleanAnswerText\(parsed\.answer\)/)
})
