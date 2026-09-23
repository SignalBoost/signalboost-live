import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveResponseLanguage } from '../lib/i18n/responseLanguage.ts'

test('COS i18n supports exactly the five product languages', () => {
  const source = readFileSync(join(process.cwd(), 'lib/i18n/responseLanguage.ts'), 'utf8')
  assert.match(source, /\['en', 'es', 'pt', 'pl', 'ru'\]/)
})

test('prompt language overrides an English UI locale', () => {
  const prompt = 'Mam 9 godzin do zabicia w Amsterdamie w sobotę. Ląduję na Schiphol. Nie chcę wydawać dużo pieniędzy. Przygotuj ekonomiczny plan zwiedzania i podaj środki transportu.'
  assert.equal(resolveResponseLanguage(prompt, 'en'), 'pl')
})

test('Spanish, Portuguese, Russian, and English prompts resolve independently of UI locale', () => {
  assert.equal(resolveResponseLanguage('Quiero un plan barato para visitar la ciudad y usar transporte público, por favor.', 'en'), 'es')
  assert.equal(resolveResponseLanguage('Quero um plano barato para visitar a cidade e usar transporte público, por favor.', 'en'), 'pt')
  assert.equal(resolveResponseLanguage('Я хочу недорогой план поездки по городу и общественный транспорт.', 'en'), 'ru')
  assert.equal(resolveResponseLanguage('I want a cheap plan to visit the city and use public transport, please.', 'pl'), 'en')
})

test('explicit output-language request overrides the language of the prompt', () => {
  const prompt = 'Mam 9 godzin w Amsterdamie. Przygotuj plan zwiedzania, ale odpowiedz po angielsku.'
  assert.equal(resolveResponseLanguage(prompt, 'pl'), 'en')
})

test('short ambiguous turns fall back to the supported UI/session locale', () => {
  assert.equal(resolveResponseLanguage('OK', 'pt'), 'pt')
  assert.equal(resolveResponseLanguage('go', 'ru'), 'ru')
  assert.equal(resolveResponseLanguage('yes', 'xx'), 'en')
})

test('browser and primary COS both use the shared response-language resolver', () => {
  const browser = readFileSync(join(process.cwd(), 'app/api/cos-browser/route.ts'), 'utf8')
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  assert.match(browser, /resolveResponseLanguage\(prompt, body\?\.context\?\.language\)/)
  assert.match(primary, /language=languageFrom\(body,input\)/)
  assert.match(primary, /return resolveResponseLanguage\(input,body\?\.context\?\.language\)/)
})
