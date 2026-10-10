// saas/tests/crossLanguageLiveParity.node.test.ts
//
// CROSS-LANGUAGE ROUTING PARITY (2026-10-09). A question must be routed to live verification, or not, the same way
// whatever language it is asked in. Measured before this change: only 85 of 210 non-English live-fact questions
// routed live (exchange rates, prices, weather, scores, visas, wages, flights, versions, vulnerabilities, life
// status, population, inflation, interest rates, opening hours leaked to model memory in most languages).
// Deterministic layer: every category, both directions. Semantic layer: unflagged non-English questions are sent
// to the model judge in both entry points.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import { mayBeNonEnglish } from '../lib/ai/cos/crossLanguageFreshness.ts'
import { LIVE_CATEGORIES, LIVE_CORPUS, NOT_LIVE_CORPUS } from './fixtures/crossLanguageLiveCorpus.ts'

const LANGUAGES = ['en', 'pt', 'es', 'fr', 'it', 'de', 'pl', 'ru', 'ja', 'ko', 'ar']

test('the corpus covers all 11 languages with one question per category', () => {
  assert.deepEqual(Object.keys(LIVE_CORPUS).sort(), [...LANGUAGES].sort())
  assert.deepEqual(Object.keys(NOT_LIVE_CORPUS).sort(), [...LANGUAGES].sort())
  for (const lang of LANGUAGES) {
    assert.equal(LIVE_CORPUS[lang].length, LIVE_CATEGORIES.length, lang)
    assert.equal(NOT_LIVE_CORPUS[lang].length, NOT_LIVE_CORPUS.en.length, lang)
  }
})

test('every live-fact category routes to live verification in English (baseline)', () => {
  LIVE_CORPUS.en.forEach((question, index) => assert.equal(requiresFreshExternalEvidence(question), true, `${LIVE_CATEGORIES[index]}: ${question}`))
})

test('every live-fact category routes to live verification in all ten other languages (210/210)', () => {
  const misses: string[] = []
  for (const lang of LANGUAGES.filter(code => code !== 'en')) {
    LIVE_CORPUS[lang].forEach((question, index) => {
      if (!requiresFreshExternalEvidence(question)) misses.push(`${lang} ${LIVE_CATEGORIES[index]}: ${question}`)
    })
  }
  assert.deepEqual(misses, [])
})

test('questions English answers from memory are not sent to live verification in any language (0/77)', () => {
  NOT_LIVE_CORPUS.en.forEach(question => assert.equal(requiresFreshExternalEvidence(question), false, question))
  const wronglyLive: string[] = []
  for (const lang of LANGUAGES) {
    for (const question of NOT_LIVE_CORPUS[lang]) if (requiresFreshExternalEvidence(question)) wronglyLive.push(`${lang}: ${question}`)
  }
  assert.deepEqual(wronglyLive, [])
})

test('"last night" keeps a live window in Portuguese, Polish and Russian instead of becoming "yesterday"', () => {
  assert.equal(requiresFreshExternalEvidence('qual foi o placar do jogo do real madrid ontem à noite?'), true)
  assert.equal(requiresFreshExternalEvidence('jaki był wynik meczu realu madryt wczoraj wieczorem?'), true)
  assert.equal(requiresFreshExternalEvidence('какой был счёт в матче реала мадрид вчера вечером?'), true)
})

test('non-English detection: every corpus question in every other language, never plain English', () => {
  for (const lang of LANGUAGES.filter(code => code !== 'en')) {
    for (const question of [...LIVE_CORPUS[lang], ...NOT_LIVE_CORPUS[lang]]) assert.equal(mayBeNonEnglish(question), true, `${lang}: ${question}`)
  }
  for (const question of [...LIVE_CORPUS.en, ...NOT_LIVE_CORPUS.en, 'what was the outcome?', 'is it still open today?']) {
    assert.equal(mayBeNonEnglish(question), false, question)
    assert.equal(mayBeNonEnglish(question, 'en'), false, question)
  }
  assert.equal(mayBeNonEnglish('what is the price?', 'pt'), true, 'a non-English reply language counts')
  assert.equal(mayBeNonEnglish('it’s “quoted” — fine…'), false, 'typographic punctuation is not a language signal')
})

test('the judge finding that sends a turn to live verification is one shared rule', () => {
  // Read from source: the judge module imports the reasoner through the @/ alias, which the plain-node release
  // gate that runs this file does not resolve.
  const judge = readFileSync(new URL('../lib/ai/cos/cosSemanticTaskIntent.ts', import.meta.url), 'utf8')
  assert.match(judge, /export function semanticIntentRequiresFreshness\(intent: CosSemanticTaskIntent \| null\): boolean \{\s*return Boolean\(\s*intent\s*&& intent\.mode === 'external_fact_verification'\s*&& intent\.externalFactsRequired\s*&& intent\.confidence >= 0\.72,\s*\)\s*\}/)
})

test('the chat route sends unflagged non-English questions to the judge and acts on its live finding', () => {
  const route = readFileSync(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.match(route, /const nonEnglishUnflagged=!heuristicRequiresFreshEvidence&&!conversationRecallRequested&&mayBeNonEnglish\(input,language\)/)
  assert.match(route, /freshConversationContext\.contextUsed \|\| nonEnglishUnflagged\)/)
  assert.match(route, /const semanticRequiresFreshEvidence=semanticIntentRequiresFreshness\(semanticTaskIntent\)/)
  assert.match(route, /baselineRequiresFreshEvidence=\(modelPlannedFreshEvidence\|\|heuristicRequiresFreshEvidence\|\|semanticRequiresFreshEvidence\)/)
})

test('the shared COS entry point does the same for every other caller', () => {
  const core = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerCore.ts', import.meta.url), 'utf8')
  assert.match(core, /const nonEnglishUnflagged = !heuristicRequiresFreshEvidence && mayBeNonEnglish\(input\.prompt, input\.language\)/)
  assert.match(core, /const semanticTaskIntent = heuristicRequiresFreshEvidence \|\| nonEnglishUnflagged\s*\n\s*\? await classifyCosSemanticTaskIntent\(/)
  assert.match(core, /const baselineRequiresFreshEvidence = heuristicRequiresFreshEvidence \|\| semanticIntentRequiresFreshness\(semanticTaskIntent\)/)
})
