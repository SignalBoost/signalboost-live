import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildMassDistillationBatches,
  retainedMaterialFingerprint,
} from '../lib/ai/cos/cosUniversityMassDistillation.ts'

const h = (n: number) => n.toString(16).padStart(64, '0')
const packager = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillation.ts', import.meta.url), 'utf8')
const consumer = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts', import.meta.url), 'utf8')

test('retained material fingerprint ignores provenance identity and stays deterministic', () => {
  const first = retainedMaterialFingerprint({
    sourceTitle: 'Binary Search',
    summary: 'Search a sorted array by repeatedly halving the remaining interval.',
    facts: ['Requires sorted input', 'Runs in logarithmic time'],
  })
  const second = retainedMaterialFingerprint({
    sourceTitle: '  Binary   Search ',
    summary: 'Search a sorted array by repeatedly halving the remaining interval.',
    facts: ['Requires sorted input', 'Runs in logarithmic time'],
  })
  assert.equal(first, second)
  assert.match(first, /^[a-f0-9]{64}$/)
})

test('duplicate retained material cannot manufacture a trainable batch from unique content hashes', () => {
  const fingerprint = retainedMaterialFingerprint({
    sourceTitle: 'Binary Search',
    summary: 'One retained lesson repeated through many provenance records.',
    facts: ['Sorted input', 'Halve the search interval'],
  })
  const rows = Array.from({ length: 34 }, (_, index) => ({
    contentHash: h(index + 1),
    subject: 'Data Structures and Algorithms in Python',
    sourceKind: 'scientific_journal',
    license: 'Public Domain',
    confidence: 0.95,
    materialFingerprint: fingerprint,
  }))
  assert.deepEqual(buildMassDistillationBatches(rows), [])
})

test('twenty genuinely distinct retained materials remain eligible for one bounded batch', () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    contentHash: h(index + 1),
    subject: 'Data Structures',
    sourceKind: 'scientific_journal',
    license: 'Public Domain',
    confidence: 0.95,
    materialFingerprint: retainedMaterialFingerprint({
      sourceTitle: `Topic ${index + 1}`,
      summary: `Distinct retained material ${index + 1}`,
      facts: [`Fact ${index + 1}`],
    }),
  }))
  const batches = buildMassDistillationBatches(rows)
  assert.equal(batches.length, 1)
  assert.equal(batches[0].sourceCount, 20)
})

test('quarantined and superseded batches release source identities for deduplicated repackaging', () => {
  assert.match(packager, /\.in\('status', \['prepared', 'teacher_synthesis_ready', 'consumed'\]\)/)
  assert.doesNotMatch(packager, /\.in\('status', \[[^\]]*'quarantined'/)
  assert.doesNotMatch(packager, /\.in\('status', \[[^\]]*'superseded'/)
})

test('teacher dispatch deduplicates exact prompt bodies and fails before provider submission', () => {
  assert.match(consumer, /const seenPromptBodies = new Set<string>\(\)/)
  assert.match(consumer, /if \(seenPromptBodies\.has\(promptBodyHash\)\) continue/)
  assert.match(consumer, /mass_distillation_teacher_prompt_diversity_insufficient:/)
  const diversityGate = consumer.indexOf('mass_distillation_teacher_prompt_diversity_insufficient:')
  const modelLookup = consumer.indexOf('resolveHuggingFaceModelMetadata({ modelId: teacherModelId')
  const submit = consumer.indexOf('await submitHuggingFaceJob')
  assert.ok(diversityGate >= 0 && modelLookup > diversityGate && submit > modelLookup)
})
