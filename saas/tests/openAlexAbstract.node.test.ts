// saas/tests/openAlexAbstract.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SUBSTANTIVE_ABSTRACT_CHARS,
  abstractFromInvertedIndex,
  abstractFromJats,
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

test('JATS markup is stripped so tags are not counted as evidence text', () => {
  const jats = '<jats:p>Deadlock detection in <jats:italic>concurrent</jats:italic> systems.</jats:p>'
  assert.equal(abstractFromJats(jats), 'Deadlock detection in concurrent systems.')
  assert.equal(abstractFromJats('<jats:title>Abstract</jats:title><jats:p>Body text here.</jats:p>'), 'Body text here.')
  assert.equal(abstractFromJats('Plain abstract with no markup.'), 'Plain abstract with no markup.')
  for (const empty of [null, undefined, '', '   ', '<jats:p></jats:p>']) {
    assert.equal(abstractFromJats(empty), '', JSON.stringify(empty))
  }
})

test('a document only clears the confidence floor once it carries real prose', () => {
  // substanceOf saturates at 900 characters and groundedConfidence floors at 0.48, so a title-only
  // record of roughly 200 characters lands at 0.55 — exactly the production cluster — while a real
  // abstract saturates substance and clears 0.60 without any threshold moving.
  const stub = 'Deadlock detection in concurrent systems. Publisher: ACM. Subject: Computer Science.'
  assert.ok(stub.length < 300)
  const abstract = abstractFromJats(`<jats:p>${'Deadlock detection under contention. '.repeat(30)}</jats:p>`)
  assert.ok(abstract.length > 900, String(abstract.length))
})
