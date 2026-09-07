import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { freshVisualComposition, freshVisualPrompt } from '../lib/visuals/freshGeneration.ts'

const contaminatedRoutePrompt = (objective: string) => [
  'Create one polished, high-quality original visual for the user request below.',
  'Use a style appropriate to the requested format, with strong composition, clear visual hierarchy, and no watermarks.',
  'Let the request itself decide the visual format — an illustrated scene, a portrait, an emblem, a diagram — and match it.',
  'Never impose a centered badge, emblem, roundel, crest, or logo composition on a request that did not ask for one.',
  'Do not reconstruct, imitate, or claim to reproduce an existing named brand or team mark from model memory.',
  '',
  'USER REQUEST:',
  objective,
].join('\n')

test('ordinary scene generation strips unrelated graphic-mark vocabulary before provider execution', () => {
  const objective = 'draw 2 kids playing football in the rain'
  const prompt = freshVisualPrompt(contaminatedRoutePrompt(objective), 'variation-a')

  assert.ok(prompt.startsWith(objective))
  assert.match(prompt, /FULL-FRAME VISUAL GENERATION DIRECTIVE:/)
  assert.match(prompt, /edge-to-edge image occupying the entire rectangular canvas/i)
  assert.match(prompt, /background continuously to every edge/i)
  assert.doesNotMatch(prompt, /\b(?:logo|badge|emblem|insignia|icon|crest|shield|roundel|medallion|sticker)\b/i)
})

test('repeated identical Concierge visual requests receive fresh semantic composition guidance', () => {
  const objective = 'draw 2 kids playing football in the rain'
  const first = freshVisualPrompt(contaminatedRoutePrompt(objective), 'variation-a')
  const second = freshVisualPrompt(contaminatedRoutePrompt(objective), 'variation-b')

  assert.notEqual(first, second)
  assert.notEqual(freshVisualComposition('variation-a'), freshVisualComposition('variation-b'))
  assert.ok(first.startsWith(objective))
  assert.ok(second.startsWith(objective))
  assert.match(first, /FRESH GENERATION DIRECTIVE:/)
  assert.match(first, /recognizably different from earlier generations/i)
  assert.match(first, /Every explicit user requirement overrides the variation directive/i)
  assert.match(first, /do not render, quote, label, or otherwise expose/i)
})

test('graphic-mark requests retain their dedicated mark-generation instructions', () => {
  const objective = 'create an original logo for a bakery called North Star'
  const prompt = freshVisualPrompt(contaminatedRoutePrompt(objective), 'variation-mark')

  assert.ok(prompt.startsWith(objective))
  assert.match(prompt, /ORIGINAL GRAPHIC-MARK GENERATION DIRECTIVE:/)
  assert.match(prompt, /clean design asset/i)
  assert.doesNotMatch(prompt, /FULL-FRAME VISUAL GENERATION DIRECTIVE:/)
})

test('fresh composition guidance changes only unspecified details', () => {
  const objective = 'draw a red airplane on the moon, viewed from directly above'
  const prompt = freshVisualPrompt(contaminatedRoutePrompt(objective), '00000000-0000-4000-8000-000000000001')

  assert.ok(prompt.startsWith(objective))
  assert.match(prompt, /Only vary details the user did not explicitly constrain/i)
  assert.match(prompt, /Preserve the user-requested subject, constraints, and meaning/i)
})

test('the platform image adapter applies fresh variation before calling the provider', async () => {
  const source = await readFile(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')
  assert.match(source, /prompt:\s*freshVisualPrompt\(prompt\)/)
})
