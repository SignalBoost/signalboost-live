import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveResponseLanguage } from '../lib/i18n/responseLanguage.ts'

test('COS response language follows the language of the actual user prompt across all eleven supported languages', () => {
  assert.equal(resolveResponseLanguage('What is the cheapest way to get from the airport to the city?', 'pl'), 'en')
  assert.equal(resolveResponseLanguage('Quiero un plan económico para visitar la ciudad y usar transporte público.', 'en'), 'es')
  assert.equal(resolveResponseLanguage('Quero um plano econômico para visitar a cidade e usar transporte público.', 'en'), 'pt')
  assert.equal(resolveResponseLanguage('Mam 9 godzin. Chcę ekonomiczny plan zwiedzania, transport i jedną płatną atrakcję.', 'en'), 'pl')
  assert.equal(resolveResponseLanguage('Хочу недорогой план поездки, транспорт и одну платную достопримечательность.', 'en'), 'ru')
  assert.equal(resolveResponseLanguage('Ich habe 9 Stunden in Amsterdam. Ich möchte einen günstigen Plan mit Verkehrsmitteln und einer Sehenswürdigkeit.', 'en'), 'de')
  assert.equal(resolveResponseLanguage('Je veux un plan économique pour visiter la ville avec les transports en commun, merci.', 'en'), 'fr')
  assert.equal(resolveResponseLanguage('Vorrei un piano economico per visitare la città con i mezzi pubblici, grazie.', 'en'), 'it')
  assert.equal(resolveResponseLanguage('アムステルダムで9時間あります。安いプランを教えてください。', 'en'), 'ja')
  assert.equal(resolveResponseLanguage('암스테르담에서 9시간이 있어요. 저렴한 계획을 알려 주세요.', 'en'), 'ko')
  assert.equal(resolveResponseLanguage('لدي تسع ساعات في أمستردام. أريد خطة اقتصادية.', 'en'), 'ar')
})

test('Japanese is told apart from Chinese by kana; Han-only text falls back to the session locale', () => {
  assert.equal(resolveResponseLanguage('我想要一个便宜的旅行计划', 'en'), 'en')
  assert.equal(resolveResponseLanguage('我想要一个便宜的旅行计划', 'ja'), 'ja')
  assert.equal(resolveResponseLanguage('東京で安い旅行の計画を作ってください', 'en'), 'ja')
})

test('German, French and Italian prompts are not confused with each other or with English', () => {
  assert.equal(resolveResponseLanguage('Wie kann ich mein Video exportieren? Bitte nicht zu lang.', 'en'), 'de')
  assert.equal(resolveResponseLanguage('Comment est-ce que je peux exporter ma vidéo ? Merci pour votre aide.', 'en'), 'fr')
  assert.equal(resolveResponseLanguage('Come posso esportare il video? È molto importante per me.', 'en'), 'it')
  assert.equal(resolveResponseLanguage('I want a cheap plan to visit the city and use public transport, please.', 'de'), 'en')
})

test('Polish Amsterdam prompt overrides an English UI locale', () => {
  const prompt = 'Mam 9 godzin do zabicia w Amsterdamie w sobotę. Ląduję na Schiphol. Nie chcę wydawać dużo pieniędzy. Przygotuj ekonomiczny plan zwiedzania, podaj środki transportu i jedną płatną atrakcję.'
  assert.equal(resolveResponseLanguage(prompt, 'en'), 'pl')
})

test('an explicit requested output language overrides the prompt language', () => {
  assert.equal(resolveResponseLanguage('Mam 9 godzin w Amsterdamie. Odpowiedz po angielsku i podaj transport.', 'pl'), 'en')
  assert.equal(resolveResponseLanguage('I need an Amsterdam itinerary. Answer in Polish.', 'en'), 'pl')
  assert.equal(resolveResponseLanguage('Quero um plano de viagem. Responda em espanhol.', 'pt'), 'es')
})

test('explicit output-language requests work for every language, in English and in native phrasing', () => {
  const cases: Array<[string, string, string]> = [
    ['I need a plan. Answer in German.', 'en', 'de'],
    ['I need a plan. Reply in French.', 'en', 'fr'],
    ['I need a plan. Respond in Italian.', 'en', 'it'],
    ['I need a plan. Answer in Japanese.', 'en', 'ja'],
    ['I need a plan. Write it in Korean.', 'en', 'ko'],
    ['I need a plan. Reply in Arabic please.', 'en', 'ar'],
    ['Ich brauche einen Plan. Antworte auf Deutsch.', 'en', 'de'],
    ['Bitte auf Englisch antworten.', 'de', 'en'],
    ['Réponds en français, s’il te plaît.', 'en', 'fr'],
    ['Répondez en anglais.', 'fr', 'en'],
    ['Rispondi in italiano.', 'en', 'it'],
    ['Rispondimi in inglese per favore.', 'it', 'en'],
    ['日本語で答えて', 'en', 'ja'],
    ['英語で答えてください', 'ja', 'en'],
    ['한국어로 답해', 'en', 'ko'],
    ['영어로 대답해 주세요', 'ko', 'en'],
    ['أجب بالعربية', 'en', 'ar'],
    ['من فضلك أجب بالإنجليزية', 'ar', 'en'],
    ['Mam 9 godzin. Odpowiedz po niemiecku.', 'pl', 'de'],
    ['Quiero un plan. Responde en alemán.', 'es', 'de'],
    ['Quero um plano. Responda em francês.', 'pt', 'fr'],
    ['Напиши по-японски.', 'ru', 'ja'],
  ]
  for (const [prompt, context, expected] of cases) assert.equal(resolveResponseLanguage(prompt, context), expected, prompt)
})

test('short or ambiguous turns fall back to the active platform locale', () => {
  assert.equal(resolveResponseLanguage('OK', 'pl'), 'pl')
  assert.equal(resolveResponseLanguage('yes', 'es'), 'es')
  assert.equal(resolveResponseLanguage('go', 'ru'), 'ru')
  for (const language of ['de', 'fr', 'it', 'ja', 'ko', 'ar']) assert.equal(resolveResponseLanguage('OK', language), language)
})

test('browser ingress and COS primary share the same response-language resolver', () => {
  const browser = readFileSync(join(process.cwd(), 'app/api/cos-browser/route.ts'), 'utf8')
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  assert.match(browser, /resolveResponseLanguage\(prompt, body\?\.context\?\.language\)/)
  assert.match(primary, /language=languageFrom\(body,input\)/)
  assert.match(primary, /resolveResponseLanguage\(input,body\?\.context\?\.language\)/)
})

test('platform ships exactly the canonical eleven public locale dictionaries', () => {
  for (const lang of ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar']) {
    const text = readFileSync(join(process.cwd(), 'public/i18n', `${lang}.json`), 'utf8')
    assert.ok(text.trim().startsWith('{'), lang)
  }
})
