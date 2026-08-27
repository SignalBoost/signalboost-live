import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OPERATIONAL_SYSTEMS_CURRICULUM_ID,
  isOperationalSystemsGap,
  operationalSystemsCurriculumSignals,
  operationalSystemsKnowledgeGaps,
} from '../lib/ai/cos/operationalSystemsLearning.ts'

test('operational curriculum is bounded, dated, advisory, and rotates by day', () => {
  const first = operationalSystemsKnowledgeGaps(new Date('2026-08-27T12:00:00Z'))
  const next = operationalSystemsKnowledgeGaps(new Date('2026-08-28T12:00:00Z'))
  assert.equal(first.length, 4)
  assert.equal(next.length, 4)
  assert.ok(first.every(gap => gap.id.startsWith(`${OPERATIONAL_SYSTEMS_CURRICULUM_ID}:`)))
  assert.ok(first.every(gap => isOperationalSystemsGap(gap)))
  assert.ok(first.every(gap => /advisory only/i.test(gap.evidence.join(' '))))
  assert.ok(first.every(gap => !/open the breaker|actuate BMS|trip the PDU/i.test(gap.question)))
  assert.notDeepEqual(first.map(gap => gap.id), next.map(gap => gap.id))
})

test('curriculum signals stay owner-injectable and low-confidence so they rank as study work', () => {
  const signals = operationalSystemsCurriculumSignals(new Date('2026-08-27T12:00:00Z'))
  assert.equal(signals.length, 4)
  assert.ok(signals.every(signal => signal.portableIds?.includes('cos')))
  assert.ok(signals.every(signal => signal.confidence === 0.2))
  assert.ok(signals.every(signal => signal.escalated === true))
})
