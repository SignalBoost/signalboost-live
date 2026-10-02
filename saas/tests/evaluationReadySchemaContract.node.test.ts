import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20261002221000_allow_evaluation_ready_artifact_status.sql', import.meta.url), 'utf8')
const consumer = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts', import.meta.url), 'utf8')
const quarantine = readFileSync(new URL('../lib/ai/cos/cosUniversityQuarantineResolution.ts', import.meta.url), 'utf8')

test('database status contract admits the governed evaluation_ready lifecycle stage', () => {
  assert.match(migration, /'evaluation_ready'/)
  assert.match(consumer, /status:\s*'evaluation_ready'/)
  assert.match(quarantine, /'evaluation_ready'/)
})
