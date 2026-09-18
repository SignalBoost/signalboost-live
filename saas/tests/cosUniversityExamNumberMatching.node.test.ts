// saas/tests/cosUniversityExamNumberMatching.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { COS_UNIVERSITY_EXAM_SCORER, statesExpectedNumber } from '../lib/ai/cos/cosUniversityIndependentExam.ts'

const breakEven = 100000 / 30 // 3333.3333333333335 in floating point

test('the recorded Economics failure: correctly rounded break-even answers now match', () => {
  for (const answer of ['Break-even is 3,333.33 units.', 'about 3333.3 units', 'Q = 3333.33', 'round up to 3,334 units']) {
    assert.equal(statesExpectedNumber(answer, breakEven, true), true, answer)
  }
  assert.equal(statesExpectedNumber('3333.3333333333335', breakEven, true), true)
})

test('wrong or imprecise numbers still fail', () => {
  assert.equal(statesExpectedNumber('3,333.4 units', breakEven, true), false)
  assert.equal(statesExpectedNumber('3,333 units', breakEven, true), false)
  assert.equal(statesExpectedNumber('3,335 units', breakEven, true), false)
  assert.equal(statesExpectedNumber('3,334 units', breakEven, false), false)
  assert.equal(statesExpectedNumber('no number', breakEven, true), false)
})

test('integers accept thousands separators and trailing zero decimals, but not other values', () => {
  assert.equal(statesExpectedNumber('Break-even: 6,000 units', 6000), true)
  assert.equal(statesExpectedNumber('6000.00', 6000), true)
  assert.equal(statesExpectedNumber('60,000', 6000), false)
  assert.equal(statesExpectedNumber('6,0001', 6000), false)
  assert.equal(statesExpectedNumber('margin $25 per unit', 25), true)
  assert.equal(statesExpectedNumber('margin $250 per unit', 25), false)
})

test('decimal rates and distances match at the stated precision', () => {
  assert.equal(statesExpectedNumber('rate 12.5%', 12.5), true)
  assert.equal(statesExpectedNumber('difference 2.5 percentage points', 2.5), true)
  assert.equal(statesExpectedNumber('difference 25 percentage points', 2.5), false)
  assert.equal(statesExpectedNumber('distance 22.5 m', 22.5), true)
  assert.equal(statesExpectedNumber('distance 22 m', 22.5), false)
})

test('scorer version is bumped and no subject rubric demands a literal floating-point string', () => {
  assert.equal(COS_UNIVERSITY_EXAM_SCORER, 'university-host-scorer-v3')
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityIndependentExam.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /exactNumberPattern\(/)
  assert.match(source, /exactNumbers: \[\{ value: margin \}, \{ value: breakEven, allowCeilInteger: true \}\]/)
  assert.match(source, /exact_number_missing:/)
})
