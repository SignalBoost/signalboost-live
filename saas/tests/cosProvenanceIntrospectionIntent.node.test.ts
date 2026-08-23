import assert from 'node:assert/strict'
import test from 'node:test'
import { asksWhereTheAnswerCameFrom } from '../lib/ai/cos/provenanceIntrospection.ts'

test('recognizes natural source follow-ups in every COS language', () => {
  for (const query of [
    'show me where from you got the answer for the question?',
    'what sources did you use?',
    '¿de dónde sacaste esta respuesta?',
    'quais são suas fontes?',
    'skąd masz tę odpowiedź?',
    'откуда у вас эта информация?',
  ]) assert.equal(asksWhereTheAnswerCameFrom(query), true, query)
})

test('does not hijack content or conditional advice questions', () => {
  for (const query of ['where do plants get their energy?', 'how do you know when bread is done?', 'what is the weather today?']) {
    assert.equal(asksWhereTheAnswerCameFrom(query), false, query)
  }
})
