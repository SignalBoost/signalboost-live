// saas/tests/cosUniversityMassDistillationRealSourceSupply.node.test.ts
//
// Production 2026-10-06: Computer Science showed 783 batchable items (minimum 64) yet no Computer Science batch had been
// packaged since 2026-10-03, so no Computer Science artifact could be trained or reach Builder Residency. The packager
// refuses a batch unless at least half of it is real-source material; the supply figure counted remediation and
// generated rows too. Supply now also reports real-source items the way the packager counts them, and the packager
// sizes a batch to the real-source material (twice it, 64 to 128 items) instead of refusing it outright. These tests
// hold the two to the same rule and pin the unchanged floors: at least 64 items, at least half real-source.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  analyzeMassDistillationSupply,
  buildMassDistillationBatches,
  type RetainedDistillationIdentity,
} from '../lib/ai/cos/cosUniversityMassDistillation.ts'
import { buildMassDistillationReplenishmentGaps } from '../lib/ai/cos/cosUniversityDistillationCurriculumPlan.ts'

const CS = 'Computer Science & Coding'
const h = (value: string) => createHash('sha256').update(value).digest('hex')

function rows(input: { real: number; failure: number; teacher: number; subject?: string; prefix?: string }): RetainedDistillationIdentity[] {
  const make = (kind: string, sourceKind: string, count: number) => Array.from({ length: count }, (_, index) => ({
    contentHash: h(`${input.prefix || ''}${kind}-content-${index}`),
    materialHash: h(`${input.prefix || ''}${kind}-material-${index}`),
    subject: input.subject || CS,
    sourceKind,
    license: 'cc0',
    confidence: 0.9,
  }))
  return [
    ...make('real', 'open_source_document', input.real),
    ...make('failure', 'failure_derived_curriculum', input.failure),
    ...make('teacher', 'teacher_hosted_curriculum', input.teacher),
  ]
}

function csSupply(identities: RetainedDistillationIdentity[], assigned: ReadonlySet<string> = new Set()) {
  const subject = analyzeMassDistillationSupply(identities, assigned).subjects.find(item => item.subject === CS)
  assert.ok(subject, 'Computer Science must appear in supply')
  return subject
}

const csBatches = (identities: RetainedDistillationIdentity[], assigned: ReadonlySet<string> = new Set()) =>
  buildMassDistillationBatches(identities, assigned, 1).filter(batch => batch.subjectId === CS).length

test('the Production shape: 783 items, 51 real-source, no 128-item batch, so the packager builds a 102-item batch', () => {
  const identities = rows({ real: 51, failure: 400, teacher: 332 })
  const supply = csSupply(identities)
  assert.equal(supply.uniqueBatchableItems, 783)
  assert.equal(supply.realSourceItems, 51)
  assert.equal(supply.realSourceNeeded, 32, 'the smallest accepted batch (64 items) needs 32 real-source items')
  const batches = buildMassDistillationBatches(identities, new Set(), 1).filter(batch => batch.subjectId === CS)
  assert.equal(batches.length, 1, 'Computer Science is packaged again')
  assert.equal(batches[0].sourceCount, 102, 'the batch is sized to the real-source material: twice 51')
  const bySource = new Map(identities.map(row => [row.contentHash, row.sourceKind]))
  const realInBatch = batches[0].sourceHashes.filter(hash => bySource.get(hash) === 'open_source_document').length
  assert.equal(realInBatch, 51, 'half of the batch is real-source, as before')
})

test('the quality floors are unchanged: below 32 real-source items nothing is packaged, and plenty still makes 128', () => {
  assert.equal(csBatches(rows({ real: 31, failure: 400, teacher: 400 })), 0, '31 real-source items cannot make a 64-item half-real batch')
  const thirtyTwo = buildMassDistillationBatches(rows({ real: 32, failure: 400, teacher: 400 }), new Set(), 1).filter(batch => batch.subjectId === CS)
  assert.deepEqual(thirtyTwo.map(batch => batch.sourceCount), [64], 'exactly the 64-item minimum')
  const plenty = buildMassDistillationBatches(rows({ real: 300, failure: 400, teacher: 400 }), new Set(), 1).filter(batch => batch.subjectId === CS)
  assert.deepEqual(plenty.map(batch => batch.sourceCount), [128], 'real-source-rich subjects keep full 128-item batches')
})

test('the packager builds a batch exactly when real-source items reach the stated need', () => {
  for (const shape of [
    { real: 63, failure: 300, teacher: 300 },
    { real: 64, failure: 300, teacher: 300 },
    { real: 200, failure: 0, teacher: 0 },
    { real: 31, failure: 20, teacher: 20 },
    { real: 32, failure: 20, teacher: 20 },
    { real: 36, failure: 0, teacher: 30 },
    { real: 0, failure: 500, teacher: 500 },
  ]) {
    const identities = rows(shape)
    const supply = csSupply(identities)
    const enough = Number(supply.realSourceItems) >= Number(supply.realSourceNeeded)
    assert.equal(csBatches(identities) > 0, enough, `${JSON.stringify(shape)}: supply says ${supply.realSourceItems}/${supply.realSourceNeeded}`)
  }
})

test('real-source items already assigned to a live batch are not counted again', () => {
  const identities = rows({ real: 100, failure: 200, teacher: 100 })
  const assigned = new Set(identities.filter(row => row.sourceKind === 'open_source_document').slice(0, 50).map(row => row.contentHash))
  const supply = csSupply(identities, assigned)
  assert.equal(supply.realSourceItems, 50)
  assert.equal(csBatches(identities, assigned) > 0, Number(supply.realSourceItems) >= Number(supply.realSourceNeeded))
})

test('independent provenance wins material deduplication even when synthetic copy is first', () => {
  const independent = rows({ real: 32, failure: 0, teacher: 0, prefix: 'origin-' })
  const duplicateSynthetic = independent.map((row, index) => ({
    ...row,
    contentHash: h('synthetic-duplicate-' + index),
    sourceKind: 'teacher_hosted_curriculum',
  }))
  const additionalSynthetic = rows({ real: 0, failure: 0, teacher: 32, prefix: 'extra-' })
  const identities = [...duplicateSynthetic, ...additionalSynthetic, ...independent]
  const supply = csSupply(identities)
  assert.equal(supply.uniqueBatchableItems, 64)
  assert.equal(supply.realSourceItems, 32)
  const batches = buildMassDistillationBatches(identities, new Set(), 1)
  assert.equal(batches.length, 1)
  assert.equal(batches[0].sourceCount, 64)
  for (const item of independent) assert.ok(batches[0].sourceHashes.includes(item.contentHash))
  for (const item of duplicateSynthetic) assert.ok(!batches[0].sourceHashes.includes(item.contentHash))
})

const fillSubject = (id: string, subject: string, items: number, shortfall: number, real?: number) => ({
  subjectKey: id,
  subject,
  canonicalSubjectId: id as any,
  uniqueBatchableItems: items,
  shortfallToBatch: shortfall,
  ...(real === undefined ? {} : { realSourceItems: real, realSourceNeeded: 32 }),
})
const fillTargets = (supply: ReturnType<typeof fillSubject>[]) =>
  [...new Set(buildMassDistillationReplenishmentGaps(supply as any, new Date('2026-10-07T18:16:00Z'), 3, 1).map(gap => gap.subject))]

test('the fill reaches the subject closest to the real-source need first (Production 2026-10-07)', () => {
  // Five fills in a row targeted these three larger subjects while Computer Science sat at 28-29 of 32.
  const supply = [
    fillSubject('computer_science', CS, 678, 0, 29),
    fillSubject('mathematics', 'Mathematics', 900, 0, 10),
    fillSubject('economics_finance', 'Economics & Finance', 800, 0, 5),
    fillSubject('history_culture_philosophy_religion', 'History, Culture, Philosophy & Religion', 700, 0, 20),
  ]
  assert.deepEqual(fillTargets(supply), [CS, 'History, Culture, Philosophy & Religion', 'Mathematics'])
})

test('subjects short on items keep their previous order; the real-source gap only ranks subjects with no item shortfall', () => {
  const supply = [
    fillSubject('computer_science', CS, 678, 0, 31),
    fillSubject('mathematics', 'Mathematics', 40, 24, 2),
    fillSubject('economics_finance', 'Economics & Finance', 50, 14, 30),
    fillSubject('cybersecurity', 'Cybersecurity', 50, 14, 1),
  ]
  // Smallest item shortfall first, as before. Cybersecurity and Economics tie on shortfall and items; Economics has the
  // smaller real-source gap but does not jump ahead, because the gap does not reorder item shortfalls.
  assert.deepEqual(fillTargets(supply), [CS, 'Cybersecurity', 'Economics & Finance'])
})

test('subjects with no real-source counts keep the previous item-count order', () => {
  const supply = [
    fillSubject('mathematics', 'Mathematics', 40, 24),
    fillSubject('economics_finance', 'Economics & Finance', 50, 14),
  ]
  assert.deepEqual(fillTargets(supply).slice(0, 2), ['Economics & Finance', 'Mathematics'])
})
// end of saas/tests/cosUniversityMassDistillationRealSourceSupply.node.test.ts (if this line is missing, the paste was cut short)
