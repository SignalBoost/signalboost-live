// saas/tests/crossLanguageLiveIntent.node.test.ts
//
// LIVE-FACT INTENT IN EVERY LANGUAGE (2026-10-09). Production: "quem sera o proximo presidente do Brasil?"
// routed to model memory (invented election date, "not held yet", invented candidates) while the same question
// in English routed to live web verification. Every question below already routes live in English; each must
// route live in all ten other supported languages too, and history/explanation questions must not.

import test from 'node:test'
import assert from 'node:assert/strict'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import { crossLanguageLiveIntent } from '../lib/ai/cos/crossLanguageLiveIntent.ts'

const ENGLISH_LIVE = [
  'who will be the next president of Brazil?',
  'who won the election in Brazil?',
  'who is the current prime minister of Portugal?',
  'who is the mayor of Paris?',
  'who is the CEO of Apple?',
  'who is the president of France?',
  'who will win the election?',
  'what is the latest news about the election in Brazil?',
  'who is the governor of Texas?',
]

const LIVE: Record<string, readonly string[]> = {
  pt: [
    'quem será o próximo presidente do Brasil?',
    'quem sera o proximo presidente do Brasil?',
    'quem ganhou a eleição no Brasil?',
    'quem ganhou a eleicao no Brasil?',
    'quem foi eleito presidente do Brasil?',
    'quem é o atual primeiro-ministro de Portugal?',
    'quem é o prefeito de Paris?',
    'quem é o CEO da Apple?',
    'quem é o presidente da França?',
    'quem vai ganhar a eleição?',
    'quais são as últimas notícias sobre a eleição no Brasil?',
    'quem é o governador do Texas?',
    'resultados da eleição no Brasil',
  ],
  es: [
    '¿quién será el próximo presidente de Brasil?',
    'quien sera el proximo presidente de Brasil?',
    '¿quién ganó las elecciones en Brasil?',
    '¿quién es el actual primer ministro de Portugal?',
    '¿quién es el alcalde de París?',
    '¿quién es el CEO de Apple?',
    '¿quién es el presidente de Francia?',
    '¿quién ganará las elecciones?',
    '¿cuáles son las últimas noticias sobre las elecciones en Brasil?',
    '¿quién es el gobernador de Texas?',
  ],
  fr: [
    'qui sera le prochain président du Brésil ?',
    'qui a gagné l\'élection au Brésil ?',
    'qui est l\'actuel premier ministre du Portugal ?',
    'qui est le maire de Paris ?',
    'qui est le PDG d\'Apple ?',
    'qui est le président de la France ?',
    'qui va gagner l\'élection ?',
    'quelles sont les dernières nouvelles sur l\'élection au Brésil ?',
    'qui est le gouverneur du Texas ?',
  ],
  it: [
    'chi sarà il prossimo presidente del Brasile?',
    'chi ha vinto le elezioni in Brasile?',
    'chi è l\'attuale primo ministro del Portogallo?',
    'chi è il sindaco di Parigi?',
    'chi è il CEO di Apple?',
    'chi è il presidente della Francia?',
    'chi vincerà le elezioni?',
    'quali sono le ultime notizie sulle elezioni in Brasile?',
    'chi è il governatore del Texas?',
  ],
  de: [
    'Wer wird der nächste Präsident Brasiliens?',
    'Wer hat die Wahl in Brasilien gewonnen?',
    'Wer ist der aktuelle Premierminister von Portugal?',
    'Wer ist der Bürgermeister von Paris?',
    'Wer ist der CEO von Apple?',
    'Wer ist der Präsident von Frankreich?',
    'Wer wird die Wahl gewinnen?',
    'Was sind die neuesten Nachrichten zur Wahl in Brasilien?',
    'Wer ist der Gouverneur von Texas?',
  ],
  pl: [
    'Kto będzie następnym prezydentem Brazylii?',
    'Kto wygrał wybory w Brazylii?',
    'Kto jest obecnym premierem Portugalii?',
    'Kto jest burmistrzem Paryża?',
    'Kto jest prezesem Apple?',
    'Kto jest prezydentem Francji?',
    'Kto wygra wybory?',
    'Jakie są najnowsze wiadomości o wyborach w Brazylii?',
    'Kto jest gubernatorem Teksasu?',
  ],
  ru: [
    'Кто будет следующим президентом Бразилии?',
    'Кто победил на выборах в Бразилии?',
    'Кто сейчас премьер-министр Португалии?',
    'Кто мэр Парижа?',
    'Кто генеральный директор Apple?',
    'Кто президент Франции?',
    'Кто победит на выборах?',
    'Какие последние новости о выборах в Бразилии?',
    'Кто губернатор Техаса?',
  ],
  ja: [
    'ブラジルの次の大統領は誰になりますか？',
    'ブラジルの選挙で誰が勝ちましたか？',
    'ポルトガルの現在の首相は誰ですか？',
    'パリの市長は誰ですか？',
    'AppleのCEOは誰ですか？',
    'フランスの大統領は誰ですか？',
    '選挙で誰が勝ちますか？',
    'ブラジルの選挙に関する最新ニュースは？',
    'テキサス州の知事は誰ですか？',
  ],
  ko: [
    '브라질의 다음 대통령은 누가 될까요?',
    '브라질 선거에서 누가 이겼나요?',
    '포르투갈의 현재 총리는 누구인가요?',
    '파리 시장은 누구인가요?',
    '애플의 CEO는 누구인가요?',
    '프랑스 대통령은 누구인가요?',
    '선거에서 누가 이길까요?',
    '브라질 선거에 관한 최신 뉴스는?',
    '텍사스 주지사는 누구인가요?',
  ],
  ar: [
    'من سيكون الرئيس القادم للبرازيل؟',
    'من فاز في الانتخابات في البرازيل؟',
    'من هو رئيس الوزراء الحالي للبرتغال؟',
    'من هو عمدة باريس؟',
    'من هو الرئيس التنفيذي لشركة Apple؟',
    'من هو رئيس فرنسا؟',
    'من سيفوز في الانتخابات؟',
    'ما هي آخر الأخبار عن الانتخابات في البرازيل؟',
    'من هو حاكم ولاية تكساس؟',
  ],
}

// History and explanation: must NOT be forced to live verification by this layer.
const NOT_LIVE: Record<string, readonly string[]> = {
  pt: ['quem foi o primeiro presidente do Brasil?', 'explique como funcionam as eleições presidenciais no Brasil', 'quem ganhou a eleição de 2018 no Brasil?'],
  es: ['¿quién fue el primer presidente de Brasil?', 'explica cómo funcionan las elecciones presidenciales en Brasil'],
  fr: ['qui était le premier président de la France ?', 'explique comment fonctionnent les élections présidentielles'],
  it: ['chi era il primo presidente della Repubblica italiana?', 'spiega come funzionano le elezioni presidenziali'],
  de: ['Wer war der erste Präsident der Bundesrepublik?', 'Erkläre, wie Präsidentschaftswahlen funktionieren'],
  pl: ['Kto był pierwszym prezydentem Polski?', 'Wyjaśnij, jak działają wybory prezydenckie'],
  ru: ['Кто был первым президентом России?', 'Объясни, как работают президентские выборы'],
  ja: ['初代アメリカ大統領は誰でしたか？', '大統領選挙の仕組みを説明してください'],
  ko: ['초대 대통령은 누구였나요?', '대통령 선거가 어떻게 진행되는지 설명해 주세요'],
  ar: ['من كان أول رئيس للبرازيل؟', 'اشرح كيف تعمل الانتخابات الرئاسية'],
}

test('baseline: every English question in the matrix already routes to live verification', () => {
  for (const question of ENGLISH_LIVE) assert.equal(requiresFreshExternalEvidence(question), true, question)
})

test('the reported production question routes to live verification, with and without accents', () => {
  assert.equal(requiresFreshExternalEvidence('quem sera o proximo presidente do Brasil?'), true)
  assert.equal(requiresFreshExternalEvidence('quem será o próximo presidente do Brasil?'), true)
  assert.equal(crossLanguageLiveIntent('quem sera o proximo presidente do Brasil?'), 'who will be the next president')
})

test('the same live questions route to live verification in all ten other languages', () => {
  const misses: string[] = []
  for (const [lang, questions] of Object.entries(LIVE)) {
    for (const question of questions) if (!requiresFreshExternalEvidence(question)) misses.push(`${lang}: ${question}`)
  }
  assert.deepEqual(misses, [])
})

test('history and explanation questions are not turned into live lookups in any language', () => {
  for (const [lang, questions] of Object.entries(NOT_LIVE)) {
    for (const question of questions) assert.equal(crossLanguageLiveIntent(question), '', `${lang}: ${question}`)
  }
})

test('a past year keeps an election question historical', () => {
  const now = new Date('2026-10-10T00:00:00Z')
  assert.equal(crossLanguageLiveIntent('quem ganhou a eleição de 2022 no Brasil?', now), '')
  assert.equal(crossLanguageLiveIntent('quem ganhou a eleição de 2026 no Brasil?', now), 'who won the election')
})

test('English input is untouched by this layer', () => {
  for (const question of [...ENGLISH_LIVE, 'explain how elections work', 'who was the first president of Brazil?']) {
    assert.equal(crossLanguageLiveIntent(question), '', question)
  }
})
