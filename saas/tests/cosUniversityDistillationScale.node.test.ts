import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  analyzeMassDistillationSupply,
  buildMassDistillationBatches,
  type RetainedDistillationIdentity,
} from '../lib/ai/cos/cosUniversityMassDistillation.ts'

const digest = (value: string) => createHash('sha256').update(value).digest('hex')

function item(index: number): RetainedDistillationIdentity {
  return Object.freeze({
    contentHash: digest(`content:${index}`),
    materialHash: digest(`material:${index}`),
    subject: 'Computer Science & Coding',
    sourceKind: 'scientific_journal',
    license: 'cc0',
    confidence: 0.99,
  })
}

test('packager handles a large buyer-sized queue without the old 100-batch software clamp', { timeout: 20_000 }, () => {
  const uniqueCount = 25_600 // exactly 200 full 128-item batches
  const uniqueRows = Array.from({ length: uniqueCount }, (_, index) => item(index))
  const duplicateRows = uniqueRows.slice(0, 2_000)
  const rows = [...uniqueRows, ...duplicateRows]

  const started = performance.now()
  const supply = analyzeMassDistillationSupply(rows)
  const batches = buildMassDistillationBatches(rows, new Set(), 200)
  const elapsedMs = performance.now() - started

  assert.equal(supply.uniqueBatchableItems, uniqueCount)
  assert.equal(supply.rawUnassignedRows, rows.length)
  assert.equal(batches.length, 200)
  assert.ok(batches.every(batch => batch.sourceCount === 128))
  assert.equal(new Set(batches.flatMap(batch => batch.sourceHashes)).size, uniqueCount)
  assert.ok(elapsedMs < 15_000, `packaging took ${Math.round(elapsedMs)}ms`)
})
