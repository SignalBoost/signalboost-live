import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  explicitlyPreservedCriticalTokens,
  preservesExplicitlyRequestedCriticalTokens,
} from '../lib/ai/cos/conciergeLanguageQuality.ts'

const entrypoint = readFileSync(new URL('../lib/ai/cos/cosFirstAnswer.ts', import.meta.url), 'utf8')

test('explicit preservation is a release invariant, not merely a prompt instruction', () => {
  const prompt = 'Nuestro piloto se llama ALPHA-42. Mantén ALPHA-42 sin cambios.'
  assert.deepEqual(explicitlyPreservedCriticalTokens(prompt), ['ALPHA-42'])
  assert.equal(preservesExplicitlyRequestedCriticalTokens(prompt, 'ALPHA-42 sigue siendo el identificador.'), true)
  assert.equal(preservesExplicitlyRequestedCriticalTokens(prompt, 'El identificador del proyecto sigue igual.'), false)

  assert.match(entrypoint, /const explicitlyProtected = explicitlyPreservedCriticalTokens/)
  assert.match(entrypoint, /const alreadyPreserved = preservesExplicitlyRequestedCriticalTokens/)
  assert.match(entrypoint, /language === 'en' && alreadyPreserved/)
  assert.match(entrypoint, /EXPLICITLY PROTECTED LITERALS/)
  assert.match(entrypoint, /if \(!preservesExplicitlyRequestedCriticalTokens\([\s\S]*restoredDecisionAnswer\)\) \{/)
  assert.match(entrypoint, /still missing after the bounded repair/)
})

test('native reviewer is explicitly required to scan morphology and agreement', () => {
  assert.match(entrypoint, /Improve grammar, morphology, agreement, idiom, register, fluency/)
  assert.match(entrypoint, /Perform a silent final scan before returning/)
  assert.match(entrypoint, /Restoring it is instruction repair, not a new factual claim/)
})
