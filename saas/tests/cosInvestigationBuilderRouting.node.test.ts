import assert from 'node:assert/strict'
import test from 'node:test'
import { isConciergeBuilderObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'

test('explicit forensic investigation stays in COS reasoning rather than launching Builder', () => {
  const prompt = [
    'You are an incident commander.',
    'Do NOT write code, create files, or generate a project. Only investigate.',
    'A payment service processes 1 million transactions/day.',
    '1. List every plausible root cause.',
    '2. Rank causes by probability.',
    '3. Describe missing evidence.',
    '4. Design discriminating experiments.',
  ].join('\n')
  assert.equal(isConciergeBuilderObjective(prompt), false)
})
test('unrelated database investigation does not create a project', () => {
  const prompt = 'Investigate unexpected PostgreSQL storage growth. Do not create files or run tests. Analyze causes and recommend read-only checks.'
  assert.equal(isConciergeBuilderObjective(prompt), false)
})
test('affirmative project construction remains allowed', () => {
  assert.equal(isConciergeBuilderObjective('Build a Node.js application with src/index.js and tests/index.test.js, create all required files, run npm test.'), true)
})
