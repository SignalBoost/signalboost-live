import test from 'node:test'
import assert from 'node:assert/strict'
import { builderCopiedTranscriptBlocker } from '../lib/builder/copied-transcript-guard.ts'

test('blocks pasted prior COS request and response before spending', () => {
  const text = 'YOUR REQUEST 1\n# Calculator API\nBuild a calculator.\n\nCOS response 1\nJob ID: abc\nFinal result: PASS'
  assert.equal(builderCopiedTranscriptBlocker(text)?.error, 'builder_copied_conversation_objective')
})
test('accepts a standalone new complex coding objective', () => {
  assert.equal(builderCopiedTranscriptBlocker('# Sales and Inventory Management System\nBuild a Node.js application with 30 tests.'), null)
})
test('accepts quoted diagnostic logs without conversation markers', () => {
  assert.equal(builderCopiedTranscriptBlocker('Fix the bug.\nError: COS response parsing failed.'), null)
})
test('accepts a normal current request mentioning history in prose', () => {
  assert.equal(builderCopiedTranscriptBlocker('Create a new repo. Previous COS response 1 was invalid.'), null)
})
