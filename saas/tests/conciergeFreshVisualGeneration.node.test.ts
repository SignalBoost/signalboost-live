import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { freshVisualComposition, freshVisualPrompt } from '../lib/visuals/freshGeneration.ts'

test('repeated identical Concierge visual requests receive fresh semantic composition guidance', () => {
  const objective = 'draw 2 kids playing football in the rain'
  const first = freshVisualPrompt(objective, 'variation-a')
  const second = freshVisualPrompt(objective, 'variation-b')

  assert.notEqual(first, second)
  assert.notEqual(freshVisualComposition('variation-a'), freshVisualComposition('variation-b'))
  assert.ok(first.startsWith(objective))
  assert.ok(second.startsWith(objective))
  assert.match(first, /FRESH GENERATION DIRECTIVE:/)
  assert.match(first, /recognizably different from earlier generations/i)
  assert.match(first, /Every explicit user requirement overrides the variation directive/i)
  assert.match(first, /do not render, quote, label, or otherwise expose/i)
})

test('fresh composition guidance changes only unspecified details', () => {
  const objective = 'draw a red airplane on the moon, viewed from directly above'
  const prompt = freshVisualPrompt(objective, '00000000-0000-4000-8000-000000000001')

  assert.ok(prompt.startsWith(objective))
  assert.match(prompt, /Only vary details the user did not explicitly constrain/i)
  assert.match(prompt, /Preserve the user-requested subject, constraints, and meaning/i)
})

test('the platform image adapter applies fresh variation before calling the provider', async () => {
  const source = await readFile(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')
  assert.match(source, /prompt:\s*freshVisualPrompt\(prompt\)/)
})
