import assert from 'node:assert/strict'
import test from 'node:test'
import { createSqlRecipeMemory } from '../lib/supervisor/portable/sql-recipe-memory.ts'
import { PERFORMANCE_INCIDENT_RECIPE } from '../lib/ai/cos/incidentRecipeRouter.ts'

test('writes and reads connector recipes through buyer SQL client', async () => {
  let stored: string | undefined
  const memory = createSqlRecipeMemory({
    sql: {
      async queryOne() { return stored ? { recipe_json: stored } : undefined },
      async execute(_sql, params) { stored = String(params[1]) },
    },
  })
  await memory.set('tenant:prod:vercel:performance', PERFORMANCE_INCIDENT_RECIPE)
  const recipe = await memory.get('tenant:prod:vercel:performance')
  assert.equal(recipe?.id, 'self-healing.performance.v1')
})

test('rejects unsafe SQL table identifiers', () => {
  assert.throws(() => createSqlRecipeMemory({
    tableName: 'recipe_memory;drop table x',
    sql: { async queryOne() { return undefined }, async execute() {} },
  }))
})
