// saas/tests/cosUniversityMassDistillationRealSourceSupply.node.test.ts
//
// Production 2026-10-06: Computer Science showed 783 batchable items (minimum 64) yet no Computer Science batch had been
// packaged since 2026-10-03, so no Computer Science artifact could be trained or reach Builder Residency. The packager
// refuses a batch unless at least half of it is real-source material; the supply figure counted remediation and
// generated rows too. Supply now also reports real-source items the way the packager counts them. These tests hold the
// two to the same rule: the packager builds a subject's batch exactly when real-source items reach the stated need.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  analyzeMassDistillationSupply,
  buildMassDistillationBatches,
  type RetainedDistillationIdentity,
} from '../lib/ai/cos/cosUniversityMassDistillation.ts'

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

test('the Production shape: plenty of items, too little real-source material, no batch, and supply now says why', () => {
  const identities = rows({ real: 40, failure: 400, teacher: 343 })
  const supply = csSupply(identities)
  assert.equal(supply.uniqueBatchableItems, 783)
  assert.equal(supply.shortfallToBatch, 0, 'the old figure reports no shortfall')
  assert.equal(supply.realSourceItems, 40)
  assert.equal(supply.realSourceNeeded, 64, 'a 128-item batch needs 64 real-source items')
  assert.equal(csBatches(identities), 0, 'the packager refuses the batch')
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
  const identities = rows({ real: 100, failure: 200, teacher: 0 })
  const assigned = new Set(identities.filter(row => row.sourceKind === 'open_source_document').slice(0, 50).map(row => row.contentHash))
  const supply = csSupply(identities, assigned)
  assert.equal(supply.realSourceItems, 50)
  assert.equal(csBatches(identities, assigned) > 0, Number(supply.realSourceItems) >= Number(supply.realSourceNeeded))
})
// end of saas/tests/cosUniversityMassDistillationRealSourceSupply.node.test.ts (if this line is missing, the paste was cut short)
