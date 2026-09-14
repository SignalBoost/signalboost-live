import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildMassDistillationBatches,
  retainedMaterialHash,
} from '../lib/ai/cos/cosUniversityMassDistillation.ts'

const h = (n: number) => n.toString(16).padStart(64, '0')
const packager = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillation.ts', import.meta.url), 'utf8')

test('assigned material hashes block alternate provenance hashes on later sweeps regardless of row order', () => {
  const rows = Array.from({ length: 20 }, (_, index) => {
    const materialHash = retainedMaterialHash({
      sourceTitle: `Assigned topic ${index + 1}`,
      summary: `Assigned retained material ${index + 1} contains enough text for a stable teaching fingerprint.`,
      facts: [`Assigned fact ${index + 1}`],
    })
    assert.ok(materialHash)
    return [
      {
        contentHash: h(index + 101), materialHash, subject: 'Reasoning & Decision Science', sourceKind: 'scientific_journal',
        license: 'Public Domain', confidence: 0.95,
      },
      {
        contentHash: h(index + 1), materialHash, subject: 'Reasoning & Decision Science', sourceKind: 'scientific_journal',
        license: 'Public Domain', confidence: 0.95,
      },
    ]
  }).flat()
  const assigned = new Set(Array.from({ length: 20 }, (_, index) => h(index + 1)))
  assert.deepEqual(buildMassDistillationBatches(rows, assigned), [])
})

test('terminal repackaging preserves history by deriving a distinct attempt key', () => {
  const rows = Array.from({ length: 20 }, (_, index) => {
    const materialHash = retainedMaterialHash({
      sourceTitle: `Retry topic ${index + 1}`,
      summary: `Retry retained material ${index + 1} contains enough text for a stable teaching fingerprint.`,
      facts: [`Retry fact ${index + 1}`],
    })
    assert.ok(materialHash)
    return {
      contentHash: h(index + 1), materialHash, subject: 'Data Structures', sourceKind: 'scientific_journal',
      license: 'Public Domain', confidence: 0.95,
    }
  })
  const first = buildMassDistillationBatches(rows)[0]
  assert.ok(first)
  const previousAttempt = new Map([[first.curriculumHash, first.batchKey]])
  const retry = buildMassDistillationBatches(rows, new Set(), 20, previousAttempt)[0]
  assert.ok(retry)
  assert.equal(retry.curriculumHash, first.curriculumHash)
  assert.deepEqual(retry.sourceHashes, first.sourceHashes)
  assert.notEqual(retry.batchKey, first.batchKey)
  assert.deepEqual(buildMassDistillationBatches(rows, new Set(), 20, previousAttempt), [retry])
})

test('packaging reads active and terminal lifecycle rows but reserves only active or consumed identities', () => {
  assert.match(packager, /ACTIVE_BATCH_STATUSES = new Set\(\['prepared', 'teacher_synthesis_ready', 'consumed'\]\)/)
  assert.match(packager, /TERMINAL_REPACKAGE_STATUSES = new Set\(\['quarantined', 'superseded'\]\)/)
  assert.match(packager, /terminalAttemptByCurriculumHash/)
  assert.match(packager, /repackagedFromBatchKey/)
  assert.match(packager, /\.order\('updated_at', \{ ascending: false \}\)/)
})
