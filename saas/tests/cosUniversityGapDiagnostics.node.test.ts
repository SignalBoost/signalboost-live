import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  incrementDiagnosticCount,
  initializeLearningGapDiagnostics,
  learningGapDiagnostic,
} from '../lib/cos-core/layers/learning/cycleDiagnostics.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('per-gap diagnostics are bounded counts and contain no study or exam content fields', () => {
  const diagnostics = initializeLearningGapDiagnostics([
    { id: 'gap:physics', subject: 'Physics & Natural Sciences' },
    { id: 'gap:cs', subject: 'Computer Science' },
  ])
  const physics = learningGapDiagnostic(diagnostics, 'gap:physics')
  assert.ok(physics)
  physics.documentsAcquired += 7
  physics.accepted += 1
  incrementDiagnosticCount(physics.rejected, 'not_relevant', 4)
  incrementDiagnosticCount(physics.rejected, 'below_source_confidence_floor', 2)
  incrementDiagnosticCount(physics.sourceErrors, 'openalex', 1)

  assert.deepEqual(physics, {
    subject: 'Physics & Natural Sciences',
    documentsAcquired: 7,
    accepted: 1,
    probationary: 0,
    rejected: { not_relevant: 4, below_source_confidence_floor: 2 },
    sourceErrors: { openalex: 1 },
  })
  const serialized = JSON.stringify(diagnostics)
  assert.doesNotMatch(serialized, /prompt|rubric|reply|sourceText|documentText|grade/i)
})

test('learning cycle attributes every outcome class to the exact gap while preserving global totals', () => {
  const cycle = file('lib/cos-core/layers/learning/cycle.ts')
  assert.match(cycle, /gapDiagnostics:initializeLearningGapDiagnostics\(prioritized\)/)
  assert.match(cycle, /const diagnostic=learningGapDiagnostic\(result\.gapDiagnostics,gap\.id\)/)
  assert.match(cycle, /diagnostic\.documentsAcquired\+=documents\.length/)
  assert.match(cycle, /incrementDiagnosticCount\(diagnostic\.sourceErrors,key\)/)
  assert.match(cycle, /incrementDiagnosticCount\(diagnostic\.rejected,'not_relevant'\)/)
  assert.match(cycle, /incrementDiagnosticCount\(diagnostic\.rejected,'below_source_confidence_floor'\)/)
  assert.match(cycle, /incrementDiagnosticCount\(diagnostic\.rejected,'duplicate'\)/)
  assert.match(cycle, /this\.recordDecision\(result,decision,diagnostic\)/)
  assert.match(cycle, /diagnostic\.accepted\+=1/)
  assert.match(cycle, /diagnostic\.probationary\+=1/)
  assert.match(cycle, /incrementDiagnosticCount\(result\.rejected,decision\.reason\)/)
})

test('University run ledger persists aggregate and per-gap diagnostics without changing learning thresholds', () => {
  const runtime = file('lib/ai/cos/cosUniversityContinuousLearning.ts')
  const cycle = file('lib/cos-core/layers/learning/cycle.ts')
  const migration = file('supabase/migrations/20260909012500_cos_university_continuous_gap_diagnostics.sql')

  assert.match(runtime, /rejected_counts: summary\.rejected/)
  assert.match(runtime, /gap_diagnostics: summary\.gapDiagnostics/)
  assert.match(runtime, /summary\.rejected = result\.rejected/)
  assert.match(runtime, /summary\.gapDiagnostics = result\.gapDiagnostics/)

  assert.match(migration, /add column if not exists rejected_counts jsonb not null default '\{\}'::jsonb/i)
  assert.match(migration, /add column if not exists gap_diagnostics jsonb not null default '\{\}'::jsonb/i)
  assert.match(migration, /never raw study or exam content/i)

  assert.match(cycle, /COS_LEARNING_MIN_RELEVANCE',0\.12/)
  assert.match(runtime, /minimumConfidence: 0\.72/)
  assert.doesNotMatch(runtime, /record.*assessment|award.*credential|academicCredit:\s*true/i)
})
