import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Gemini supervisor diagnostic uses portable JSON mode and local validation', () => {
  const source = readFileSync(new URL('../lib/autonomous-supervisor/diagnostic.ts', import.meta.url), 'utf8')
  assert.match(source, /responseMimeType: 'application\/json'/)
  assert.match(source, /Return one JSON object matching this contract exactly/)
  assert.doesNotMatch(source, /responseMimeType: 'application\/json', responseSchema/)
})
