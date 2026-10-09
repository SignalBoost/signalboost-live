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

test('the six newer platform languages are detected, and Chinese is not mistaken for Japanese', () => {
  const samples: Record<string, string> = {
    de: 'Das Erlernen einer zweiten Sprache erfordert regelmäßige Übung und den Kontakt mit lebendigen Texten. Leseverstehen ist nicht dasselbe wie Übersetzen, aber die beiden Fähigkeiten entwickeln sich gemeinsam. Die Grammatik ist ein Werkzeug, das der Kommunikation dient. ',
    fr: 'L’apprentissage d’une deuxième langue exige une pratique régulière et un contact avec des textes vivants. La compréhension écrite n’est pas la même chose que la traduction, mais les deux compétences se développent ensemble. La grammaire est un outil qui est au service de la communication. ',
    it: 'Imparare una seconda lingua richiede pratica regolare e contatto con testi vivi. La comprensione della lettura non è la stessa cosa della traduzione, ma le due abilità si sviluppano insieme. La grammatica è uno strumento che è al servizio della comunicazione. ',
    ja: '第二言語の習得には、定期的な練習と生きた文章に触れることが必要です。読解は翻訳と同じではありませんが、二つの技能は一緒に伸びていきます。文法はコミュニケーションに役立つ道具です。',
    ko: '제2언어를 배우려면 꾸준한 연습과 살아 있는 글을 접하는 것이 필요합니다. 독해는 번역과 같지 않지만 두 능력은 함께 발전합니다. 문법은 의사소통을 돕는 도구입니다.',
    ar: 'يتطلب تعلم لغة ثانية ممارسة منتظمة واحتكاكًا بالنصوص الحية. فهم المقروء ليس هو الترجمة نفسها، لكن المهارتين تتطوران معًا. القواعد أداة تخدم التواصل.',
  }
  for (const [language, text] of Object.entries(samples)) {
    assert.equal(detectDominantLanguage(text.repeat(4)), language, language)
    assert.equal(documentMatchesTargetLanguage(text.repeat(4), language), true, language)
  }
  const chinese = '学习第二语言需要定期练习并接触真实的文本。阅读理解与翻译并不相同，但这两种能力会共同发展。语法是服务于交流的工具。'
  assert.equal(detectDominantLanguage(chinese.repeat(4)), null)
  assert.equal(documentMatchesTargetLanguage(chinese.repeat(4), 'ja'), false)
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
