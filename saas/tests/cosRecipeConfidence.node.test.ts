import assert from 'node:assert/strict'
import test from 'node:test'
import { isRecipeCoolingDown, updateRecipeConfidence } from '../lib/ai/cos/recipeConfidence.ts'
import { SqlRecipeConfidenceMemory } from '../lib/supervisor/portable/sql-recipe-confidence.ts'

test('promotes recipe only after repeated successful runs', () => {
  let record
  for (let i = 0; i < 2; i += 1) record = updateRecipeConfidence(record, 1, true, { promoteAfterSuccesses: 3, now: () => 1000 + i })
  assert.equal(record?.promoted, false)
  record = updateRecipeConfidence(record, 1, true, { promoteAfterSuccesses: 3, now: () => 1002 })
  assert.equal(record.promoted, true)
  assert.equal(record.successes, 3)
})

test('enters cooldown after repeated failures and clears streak on success', () => {
  let now = 1000
  let record = updateRecipeConfidence(undefined, 0, false, { cooldownAfterFailures: 2, cooldownMs: 500, now: () => now })
  assert.equal(isRecipeCoolingDown(record, now), false)
  record = updateRecipeConfidence(record, 0, false, { cooldownAfterFailures: 2, cooldownMs: 500, now: () => now })
  assert.equal(isRecipeCoolingDown(record, now), true)
  now = 1600
  assert.equal(isRecipeCoolingDown(record, now), false)
  record = updateRecipeConfidence(record, 1, true, { now: () => now })
  assert.equal(record.consecutiveFailures, 0)
})

test('SQL confidence adapter persists structured history', async () => {
  let stored: string | undefined
  const sql = {
    async queryOne<T>() { return stored ? ({ record_json: stored } as T) : undefined },
    async execute(_sql: string, params: readonly unknown[]) { stored = String(params[1]) },
  }
  const memory = new SqlRecipeConfidenceMemory({ sql })
  const record = updateRecipeConfidence(undefined, 1, true, { now: () => 1234 })
  await memory.set('tenant:prod:provider:performance', record)
  assert.deepEqual(await memory.get('tenant:prod:provider:performance'), record)
})
