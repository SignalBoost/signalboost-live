import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/cos/aiPort.ts', import.meta.url), 'utf8')

test('an empty assigned coding completion reaches the bounded fallback instead of terminally failing', () => {
  assert.match(source, /if \(assigned\.attempted && assigned\.result\?\.content\?\.trim\(\)\) return assigned\.result\.content/)
  assert.doesNotMatch(source, /if \(assigned\.attempted\) return requireText\(assigned\.result\?\.content/)
  const empty = source.indexOf("if (assigned.attempted) console.warn('[builder-assigned-empty-completion]'")
  const fallback = source.indexOf('return requireText(await callLocalModel(', empty)
  assert.ok(empty >= 0 && fallback > empty, 'blank assigned response must fall through to local-model fallback')
})

test('fallback remains governed and retains truncated-text support', () => {
  const start = source.indexOf("if (assigned.attempted) console.warn('[builder-assigned-empty-completion]'")
  const following = source.slice(start, start + 1600)
  assert.match(following, /maxEstimatedCostUsd: deepInfraMaxCallUsd\('builder'\)/)
  assert.match(following, /allowTruncatedText: input\.allowTruncatedText === true/)
  assert.match(following, /signal: input\.signal/)
})
