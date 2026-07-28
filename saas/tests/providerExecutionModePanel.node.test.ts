import assert from 'node:assert/strict'
import { readUiSource } from './helpers/sourceWithUiCopy.mjs'
import test from 'node:test'

const source = readUiSource(new URL('../components/hub/ProviderExecutionModePanel.tsx', import.meta.url))

test('provider execution mode panel uses the governed preview route', () => {
  assert.match(source, /\/api\/hub\/action\/preview/)
  assert.match(source, /Only reviewed and implemented paths are shown/)
})

test('provider execution mode panel never exposes manual product language', () => {
  assert.doesNotMatch(source, />Manual</)
  assert.match(source, /Direct configuration/)
})

test('provider execution mode panel distinguishes executing and non-executing paths', () => {
  assert.match(source, /executesProviderMutation/)
  assert.match(source, /does not directly mutate the provider/)
  assert.match(source, /only after confirmation/)
})

test('provider execution mode panel is accessible as a radio group', () => {
  assert.match(source, /role="radiogroup"/)
  assert.match(source, /role="radio"/)
  assert.match(source, /aria-checked/)
})
