// saas/tests/cosLearningTargetLanguage.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { detectDominantLanguage, documentMatchesTargetLanguage } from '../lib/cos-core/layers/learning/learningLanguage.ts'

const polish = 'Nauka języka polskiego wymaga regularnej praktyki oraz kontaktu z żywym tekstem. '
  + 'Czytanie ze zrozumieniem nie jest tym samym co tłumaczenie, ale oba te umiejętności rozwijają się razem. '
  + 'Aby osiągnąć biegłość, uczeń musi pisać własne teksty, a nie tylko czytać cudze. '
  + 'Gramatyka jest narzędziem, które służy komunikacji, lub przynajmniej powinno jej służyć. '
const english = 'Learning a second language requires regular practice and contact with living text. '
  + 'Reading comprehension is not the same as translation, and the two skills develop together. '
  + 'To reach fluency the learner must write their own texts, not only read those of other people. '
  + 'Grammar is a tool that serves communication, or at least that is what it should do here. '

test('a Polish document is detected as Polish', () => {
  assert.equal(detectDominantLanguage(polish.repeat(3)), 'pl')
})

test('an English document is detected as English', () => {
  assert.equal(detectDominantLanguage(english.repeat(3)), 'en')
})

test('the exact production case: Polish material is on-topic for a Polish gap', () => {
  assert.equal(documentMatchesTargetLanguage(polish.repeat(3), 'pl'), true)
})

test('English commentary about Polish is not admitted by the language path', () => {
  // It remains reachable through ordinary English term overlap; it just gets no shortcut.
  assert.equal(documentMatchesTargetLanguage(english.repeat(3), 'pl'), false)
})

test('an English gap gets no language shortcut, because its anchors already match', () => {
  assert.equal(documentMatchesTargetLanguage(english.repeat(3), 'en'), false)
})

test('short or tokenless text yields no verdict rather than a guess', () => {
  assert.equal(detectDominantLanguage('krótki tekst'), null)
  assert.equal(detectDominantLanguage(''), null)
  assert.equal(detectDominantLanguage('123 456 789 '.repeat(60)), null)
})

test('an unknown or empty target language never matches', () => {
  assert.equal(documentMatchesTargetLanguage(polish.repeat(3), 'zz'), false)
  assert.equal(documentMatchesTargetLanguage(polish.repeat(3), ''), false)
  assert.equal(documentMatchesTargetLanguage(polish.repeat(3), null), false)
})

test('the language study signal declares its target language', () => {
  const source = readFileSync('lib/ai/cos/cosUniversityStudyStrategy.ts', 'utf8')
  assert.match(source, /targetLanguage: language\.id/)
})

test('the acquisition cycle consults the target language before rejecting as irrelevant', () => {
  const cycle = readFileSync('lib/cos-core/layers/learning/cycle.ts', 'utf8')
  assert.match(cycle, /documentMatchesTargetLanguage\(document\.text,gap\.targetLanguage\)/)
  assert.match(cycle, /!targetLanguageMatch&&!sourceAwareRelevant/)
})
