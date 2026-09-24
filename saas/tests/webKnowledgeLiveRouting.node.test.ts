// Diagnostic isolation: module-load only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { searchThroughGovernedWebKnowledge } from '../lib/ai/tools/governedWebKnowledgeSearch.ts'

test('governed Web Knowledge bridge loads', () => {
  assert.equal(typeof searchThroughGovernedWebKnowledge, 'function')
})
