// saas/tests/answerEvidenceAttributionRepair.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { stripInternalEvidenceIds, leaksInternalEvidenceIds } from '../lib/ai/cos/answerEvidenceIdHygiene.ts'

test('the exact production stubs are repaired', () => {
  // Observed 2026-08-26 in a released owner-channel answer: removing the [CL#] label left the
  // preposition that pointed at it, producing visible broken grammar for a buyer.
  assert.equal(
    stripInternalEvidenceIds('Each node draws 10.2 kW (inclusive of CPUs, fans, and PSU losses as per [CL2]). Total = 652.8 kW.'),
    'Each node draws 10.2 kW (inclusive of CPUs, fans, and PSU losses). Total = 652.8 kW.',
  )
  assert.equal(
    stripInternalEvidenceIds('As noted in [CL3], PUE multiplies facility power but cancels out of a price difference.'),
    'PUE multiplies facility power but cancels out of a price difference.',
  )
})

test('a sentence-initial attribution is removed and the next word recapitalised', () => {
  assert.equal(stripInternalEvidenceIds('Based on [CL4], the checkpoint is 980 GB.'), 'The checkpoint is 980 GB.')
  assert.equal(stripInternalEvidenceIds('Shown in [KG1], the loop is turbulent.'), 'The loop is turbulent.')
})

test('a mid-clause attribution is removed without disturbing the rest', () => {
  assert.equal(
    stripInternalEvidenceIds('The node figure is authoritative according to [CL1], so use it.'),
    'The node figure is authoritative, so use it.',
  )
  assert.equal(stripInternalEvidenceIds('The value is 700 W, detailed in [CL5].'), 'The value is 700 W.')
})

test('a bare trailing marker still works as before', () => {
  assert.equal(stripInternalEvidenceIds('The checkpoint is 980 GB [CL4].'), 'The checkpoint is 980 GB.')
})

test('prose with no marker is never altered', () => {
  // The repair must be a consequence of removing a label, never a general edit of the answer.
  for (const text of [
    'Per the retrieved rows, nothing changed.',
    'We based our estimate on measured data.',
    'According to the vendor datasheet, the TDP is 700 W.',
    'As noted in the previous section, flow is turbulent.',
  ]) {
    assert.equal(stripInternalEvidenceIds(text), text, text)
  }
})

test('answers that render real source URLs keep their markers', () => {
  const text = 'The figure is 700 W [CL1]. Source: https://example.com/spec'
  assert.equal(stripInternalEvidenceIds(text), text)
  assert.equal(leaksInternalEvidenceIds(text), false)
})

test('stripping never guts the answer', () => {
  const tiny = 'See [CL1].'
  const out = stripInternalEvidenceIds(tiny)
  assert.ok(out.length > 0)
})

test('empty and junk input is safe', () => {
  assert.equal(stripInternalEvidenceIds(''), '')
  assert.equal(stripInternalEvidenceIds('   ').trim(), '')
  assert.equal(leaksInternalEvidenceIds(''), false)
})
