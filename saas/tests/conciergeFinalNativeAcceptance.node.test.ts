import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  conciergeLanguageQualityInstruction,
  explicitlyPreservedCriticalTokens,
  hasAvoidableEnglishProcessJargon,
} from '../lib/ai/cos/conciergeLanguageQuality.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('explicit protected literal repair has an unambiguous standalone fallback', () => {
  const prompt = 'I want to improve a customer email for project ALPHA-42. Keep ALPHA-42 unchanged.'
  assert.deepEqual(explicitlyPreservedCriticalTokens(prompt), ['ALPHA-42'])
  const instruction = conciergeLanguageQualityInstruction('en')
  assert.match(instruction, /standalone line before the answer/i)
  assert.match(instruction, /final answer MUST contain that exact literal/i)

  const entrypoint = read('../lib/ai/cos/cosFirstAnswer.ts')
  assert.match(entrypoint, /EXPLICITLY PROTECTED LITERALS/)
  assert.match(entrypoint, /every item below MUST appear verbatim in the final answer/)
  assert.match(entrypoint, /required literal restoration/)
  assert.match(entrypoint, /explicitly preserved literal was still missing after the bounded repair/)
})

test('avoidable English process jargon is not native-quality evidence in Spanish or Brazilian Portuguese', () => {
  const spanish = 'Compensación (Trade-off): se elimina la fricción del onboarding.'
  const portuguese = 'Um rollout amplo introduz overhead significativo de onboarding.'
  assert.equal(hasAvoidableEnglishProcessJargon(spanish, 'es'), true)
  assert.equal(hasAvoidableEnglishProcessJargon(portuguese, 'pt'), true)
  assert.equal(hasAvoidableEnglishProcessJargon('El worker procesa FFmpeg.', 'es'), false)
  assert.equal(hasAvoidableEnglishProcessJargon('O worker processa FFmpeg.', 'pt'), false)
})

test('user-supplied jargon remains discussable instead of being blindly rejected', () => {
  const source = 'Explique em português o que significa onboarding neste contrato.'
  assert.equal(hasAvoidableEnglishProcessJargon('Onboarding é o processo de integração inicial.', 'pt', source), false)
  assert.equal(hasAvoidableEnglishProcessJargon('O rollout deve ocorrer amanhã.', 'pt', source), true)
})

test('the Production acceptance executor folds avoidable jargon into the English-leakage verdict', () => {
  const execution = read('../lib/ai/cos/conciergeLanguageAcceptanceExecution.ts')
  assert.match(execution, /hasAvoidableEnglishProcessJargon/)
  assert.match(execution, /noEnglishLeakage:\s*baseVerdicts\.noEnglishLeakage/)
  assert.match(execution, /!hasAvoidableEnglishProcessJargon\(reply, test\.language, test\.prompt\)/)
})

test('five-language quality policy explicitly rejects the observed process-jargon family', () => {
  const spanish = conciergeLanguageQualityInstruction('es')
  const portuguese = conciergeLanguageQualityInstruction('pt')
  for (const term of ['onboarding', 'rollout', 'overhead', 'trade-off', 'scope creep']) {
    assert.match(spanish, new RegExp(term.replace('-', '[- ]?'), 'i'))
    assert.match(portuguese, new RegExp(term.replace('-', '[- ]?'), 'i'))
  }
})
