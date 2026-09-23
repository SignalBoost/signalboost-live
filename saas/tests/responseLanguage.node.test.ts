import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveResponseLanguage } from '../lib/i18n/responseLanguage.ts'

test('COS response language follows the language of the actual user prompt across all five supported languages', () => {
  assert.equal(resolveResponseLanguage('What is the cheapest way to get from the airport to the city?', 'pl'), 'en')
  assert.equal(resolveResponseLanguage('Quiero un plan económico para visitar la ciudad y usar transporte público.', 'en'), 'es')
  assert.equal(resolveResponseLanguage('Quero um plano econômico para visitar a cidade e usar transporte público.', 'en'), 'pt')
  assert.equal(resolveResponseLanguage('Mam 9 godzin. Chcę ekonomiczny plan zwiedzania, transport i jedną płatną atrakcję.', 'en'), 'pl')
  assert.equal(resolveResponseLanguage('Хочу недорогой план поездки, транспорт и одну платную достопримечательность.', 'en'), 'ru')
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

test('short or ambiguous turns fall back to the active platform locale', () => {
  assert.equal(resolveResponseLanguage('OK', 'pl'), 'pl')
  assert.equal(resolveResponseLanguage('yes', 'es'), 'es')
  assert.equal(resolveResponseLanguage('go', 'ru'), 'ru')
})

test('browser ingress and COS primary share the same response-language resolver', () => {
  const browser = readFileSync(join(process.cwd(), 'app/api/cos-browser/route.ts'), 'utf8')
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  assert.match(browser, /resolveResponseLanguage\(prompt, body\?\.context\?\.language\)/)
  assert.match(primary, /language=languageFrom\(body,input\)/)
  assert.match(primary, /resolveResponseLanguage\(input,body\?\.context\?\.language\)/)
})

test('platform ships exactly the canonical five public locale dictionaries', () => {
  for (const lang of ['en', 'es', 'pt', 'pl', 'ru']) {
    const text = readFileSync(join(process.cwd(), 'public/i18n', `${lang}.json`), 'utf8')
    assert.ok(text.trim().startsWith('{'), lang)
  }
})
