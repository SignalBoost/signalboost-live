import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { freshVisualPrompt } from '../lib/visuals/freshGeneration.ts'

test('repeated identical Concierge visual requests receive distinct provider prompts', () => {
  const objective = 'draw 2 kids playing football in the rain'
  const first = freshVisualPrompt(objective)
  const second = freshVisualPrompt(objective)

  assert.notEqual(first, second)
  assert.match(first, new RegExp(objective.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(second, new RegExp(objective.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(first, /do not render, quote, label, or otherwise expose/i)
})

test('variation token changes composition input without changing the user objective', () => {
  const objective = 'draw a red airplane on the moon'
  const first = freshVisualPrompt(objective, 'variation-a')
  const second = freshVisualPrompt(objective, 'variation-b')

  assert.notEqual(first, second)
  assert.ok(first.startsWith(objective))
  assert.ok(second.startsWith(objective))
  assert.match(first, /variation-a/)
  assert.match(second, /variation-b/)
})

test('the platform image adapter applies fresh variation before calling the provider', async () => {
  const source = await readFile(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')
  assert.match(source, /prompt:\s*freshVisualPrompt\(prompt\)/)
})
