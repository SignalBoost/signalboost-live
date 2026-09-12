// saas/tests/openAlexAbstract.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SUBSTANTIVE_ABSTRACT_CHARS,
  abstractFromInvertedIndex,
  openAlexAbstractIsSubstantive,
} from '../lib/cos-core/layers/learning/openAlexAbstract.ts'

test('word positions are restored in order', () => {
  const index = { Deadlock: [0], detection: [1], in: [2], concurrent: [3], systems: [4] }
  assert.equal(abstractFromInvertedIndex(index), 'Deadlock detection in concurrent systems')
})

test('a word occupying several positions is placed at each of them', () => {
  const index = { the: [0, 3], cost: [1], of: [2], lock: [4] }
  assert.equal(abstractFromInvertedIndex(index), 'the cost of the lock')
})

test('gaps in the index do not produce empty words or stray spaces', () => {
  const index = { alpha: [0], gamma: [2] }
  assert.equal(abstractFromInvertedIndex(index), 'alpha gamma')
})

test('malformed input yields an empty abstract rather than throwing', () => {
  for (const input of [null, undefined, 'text', 42, [], {}, { word: 'not-an-array' }, { word: [-1] }, { word: [1.5] }]) {
    assert.equal(abstractFromInvertedIndex(input), '', JSON.stringify(input))
  }
})

test('absurd positions cannot allocate an unbounded array', () => {
  assert.equal(abstractFromInvertedIndex({ word: [Number.MAX_SAFE_INTEGER] }), '')
  assert.equal(abstractFromInvertedIndex({ near: [3999], far: [4000] }), 'near')
})

test('a real abstract counts as substantive, a one-line stub does not', () => {
  const realAbstract = abstractFromInvertedIndex(
    Object.fromEntries('We present a formal treatment of deadlock detection in concurrent systems and evaluate '
      .concat('its behaviour under contention across several scheduling disciplines, showing that the ')
      .concat('approach preserves liveness while bounding detection latency in the common case, and we ')
      .concat('report measurements from a production workload over twelve months of operation here.')
      .split(' ').filter(Boolean).map((word, position) => [`${word}_${position}`, [position]])),
  )
  assert.ok(realAbstract.length > SUBSTANTIVE_ABSTRACT_CHARS, String(realAbstract.length))
  assert.equal(openAlexAbstractIsSubstantive(realAbstract), true)

  assert.equal(openAlexAbstractIsSubstantive('A short note on locks.'), false)
  assert.equal(openAlexAbstractIsSubstantive(''), false)
})
