// saas/tests/cosProvenanceIntrospectionIntent.node.test.ts
//
// Both production failures are pinned verbatim as the first two fixtures. The negative cases carry
// equal weight: this classifier routes a question AWAY from live evidence and toward the stored
// provenance record, so a false positive would answer a real content question with a telemetry
// dump. Content questions that merely borrow source words must stay content questions.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { asksWhereTheAnswerCameFrom } from '../lib/ai/cos/provenanceIntrospectionIntent.ts'

test('all three verbatim production failures are recognized', () => {
  // 1) after a name-change answer, in Polish; 2) after a funnel sequence; 3) after an alphabet
  // script — the third had NO second-person word at all, which the first version required.
  assert.equal(asksWhereTheAnswerCameFrom('skąd masz te informacje?'), true)
  assert.equal(asksWhereTheAnswerCameFrom('show me where from you got the answer for the question?'), true)
  assert.equal(asksWhereTheAnswerCameFrom('show me where the answers came from?'), true)
})

test('origin phrasings with no second-person address are recognized', () => {
  for (const query of [
    'where the answer came from',
    'where does this answer come from?',
    'откуда эта информация?',
    'de onde veio essa resposta?',
    'pokaż mi skąd pochodzi ta odpowiedź',
  ]) {
    assert.equal(asksWhereTheAnswerCameFrom(query), true, query)
  }
})

test('topical source requests are NOT introspection — the imperative alone must not trigger it', () => {
  for (const query of [
    'show me the best sources of vitamin D',
    'what are the best sources of protein?',
    'list the sources of iron in a vegetarian diet',
  ]) {
    assert.equal(asksWhereTheAnswerCameFrom(query), false, query)
  }
})

test('ordinary English phrasings of "where did that come from" are recognized', () => {
  for (const query of [
    'where did you get this answer?',
    'what sources did you use?',
    'show me your sources',
    'where did you get that information from?',
    'how do you know this?',
    'on what basis did you say that?',
    'can you give me the citations for this answer?',
  ]) {
    assert.equal(asksWhereTheAnswerCameFrom(query), true, query)
  }
})

test('the same question in every platform language is recognized', () => {
  for (const query of [
    '¿de dónde sacaste esta respuesta?',
    '¿cuáles son tus fuentes?',
    'de onde você tirou essa informação?',
    'quais são suas fontes?',
    'skąd masz tę odpowiedź?',
    'jakie są twoje źródła?',
    'откуда у вас эта информация?',
    'какие у вас источники?',
  ]) {
    assert.equal(asksWhereTheAnswerCameFrom(query), true, query)
  }
})

test('content questions that borrow source words stay content questions', () => {
  for (const query of [
    'where do plants get their energy?',
    'where does the Nile get its water?',
    'what are the best sources of vitamin D?',
    'how do banks source liquidity overnight?',
    'where did the Roman empire get its silver?',
  ]) {
    assert.equal(asksWhereTheAnswerCameFrom(query), false, query)
  }
})

test('conditional advice questions are not hijacked', () => {
  for (const query of [
    'how do you know when bread is done?',
    'how do you know if a contract is enforceable?',
    'how do you know whether to escalate an incident?',
    'skąd wiesz kiedy ciasto jest gotowe?',
  ]) {
    assert.equal(asksWhereTheAnswerCameFrom(query), false, query)
  }
})

test('ordinary requests are untouched', () => {
  for (const query of [
    'write me a 5-video funnel sequence',
    'explain how attention works in transformers',
    'what is the weather today?',
    'who is the current president of France?',
    '',
  ]) {
    assert.equal(asksWhereTheAnswerCameFrom(query), false, query)
  }
})

test('the classifier is wired into the cos-primary introspection gate', () => {
  const route = readFileSync(new URL('../app/api/cos-primary/baseRoute.ts', import.meta.url), 'utf8')
  assert.match(route, /asksWhereTheAnswerCameFrom/)
  // It must widen the EXISTING introspection branch, not create a second answer path.
  assert.match(route, /isProvenanceIntrospection\(input\)\s*\|\|\s*asksWhereTheAnswerCameFrom\(input\)/)
})
