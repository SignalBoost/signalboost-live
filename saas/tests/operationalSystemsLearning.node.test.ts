import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { generateKnowledgeGaps } from '../lib/cos-core/layers/learning/gaps.ts'
import { normalizeDynamicStudyGaps } from '../lib/cos/dailyAutonomousLearning.ts'
import {
  OPERATIONAL_SYSTEMS_CURRICULUM_ID,
  OPERATIONAL_SYSTEMS_FOCUS_IDS,
  OPERATIONAL_SYSTEMS_SAFETY_EVIDENCE,
  isOperationalSystemsGap,
  operationalSystemsCurriculumSignals,
  operationalSystemsKnowledgeGaps,
  operationalSystemsSlot,
} from '../lib/ai/cos/operationalSystemsLearning.ts'

test('operational curriculum is bounded, rotates daily, and carries the advisory safety boundary', () => {
  const day1 = new Date('2026-08-27T12:00:00.000Z')
  const day2 = new Date('2026-08-28T12:00:00.000Z')
  const first = operationalSystemsKnowledgeGaps(day1, 99)
  const second = operationalSystemsKnowledgeGaps(day2, 99)

  assert.equal(first.length, 4)
  assert.equal(second.length, 4)
  assert.equal(operationalSystemsSlot(day2), (operationalSystemsSlot(day1) + 1) % OPERATIONAL_SYSTEMS_FOCUS_IDS.length)
  assert.notEqual(first[0]?.id, second[0]?.id)
  assert.equal(new Set(first.map(gap => gap.id)).size, first.length)
  for (const gap of first) {
    assert.ok(gap.id.startsWith(`${OPERATIONAL_SYSTEMS_CURRICULUM_ID}:`))
    assert.ok(gap.evidence.includes(OPERATIONAL_SYSTEMS_SAFETY_EVIDENCE))
    assert.ok(isOperationalSystemsGap(gap))
  }
})

test('operational signals remain discovery targets without granting physical control', () => {
  const signals = operationalSystemsCurriculumSignals(new Date('2026-08-27T12:00:00.000Z'))
  assert.equal(signals.length, 4)
  for (const signal of signals) {
    assert.match(signal.taskId, /^ops-systems:/)
    assert.equal(signal.portableIds?.[0], 'cos')
    assert.ok(signal.evidence?.includes(OPERATIONAL_SYSTEMS_SAFETY_EVIDENCE))
    assert.doesNotMatch(signal.objective, /open (?:a )?breaker|change (?:a )?BMS setpoint|write (?:a )?control point/i)
  }
})

test('daily learning subject hygiene preserves only safety-bound operational injected gaps', () => {
  const signals = operationalSystemsCurriculumSignals(new Date('2026-08-27T12:00:00.000Z'), 2)
  const generated = generateKnowledgeGaps(signals)
  assert.equal(generated.length, 2)
  assert.ok(generated.every(gap => isOperationalSystemsGap(gap)))

  const normalized = normalizeDynamicStudyGaps(generated)
  assert.equal(normalized.length, generated.length)
  assert.deepEqual(normalized.map(gap => gap.subject), generated.map(gap => gap.subject))
  assert.deepEqual(normalized.map(gap => gap.question), generated.map(gap => gap.question))
})

test('only the daily mining host injects the operational curriculum; hourly current-world remains separate', () => {
  const miningRoute = readFileSync(new URL('../app/api/cron/cos-mining/route.ts', import.meta.url), 'utf8')
  const dailyLearning = readFileSync(new URL('../lib/cos/dailyAutonomousLearning.ts', import.meta.url), 'utf8')
  const currentWorld = readFileSync(new URL('../lib/ai/cos/currentWorldLearning.ts', import.meta.url), 'utf8')

  assert.match(miningRoute, /operationalSystemsCurriculumSignals/)
  assert.match(miningRoute, /injectedGapSignals:\s*operationalSystemsCurriculumSignals\(\)/)
  assert.match(dailyLearning, /injectedGapSignals\?:\s*KnowledgeGapSignal\[\]/)
  assert.match(dailyLearning, /\.\.\.\(input\.injectedGapSignals\s*\?\?\s*\[\]\)/)
  assert.doesNotMatch(currentWorld, /operationalSystems/i)
})
