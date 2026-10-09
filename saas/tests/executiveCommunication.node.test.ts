import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  executiveCommunicationBlock,
  executiveLocale,
  executiveReasoningFramework,
  executiveWritingModule,
  multilingualTranslationQualityRule,
} from '../lib/ai/cos/executiveCommunication.ts'

test('executive locale resolution covers all eleven SignalBoost languages', () => {
  assert.equal(executiveLocale('English'), 'en')
  assert.equal(executiveLocale('pt-BR'), 'pt')
  assert.equal(executiveLocale('Español'), 'es')
  assert.equal(executiveLocale('Polski'), 'pl')
  assert.equal(executiveLocale('Русский'), 'ru')
  assert.equal(executiveLocale('Deutsch'), 'de')
  assert.equal(executiveLocale('fr-FR'), 'fr')
  assert.equal(executiveLocale('Italian'), 'it')
  assert.equal(executiveLocale('日本語'), 'ja')
  assert.equal(executiveLocale('ko-KR'), 'ko')
  assert.equal(executiveLocale('العربية'), 'ar')
})

test('each supported locale has a native executive writing module', () => {
  const modules = {
    en: executiveWritingModule('en'),
    pt: executiveWritingModule('pt'),
    es: executiveWritingModule('es'),
    pl: executiveWritingModule('pl'),
    ru: executiveWritingModule('ru'),
  }

  assert.match(modules.en, /ENGLISH EXECUTIVE COMMUNICATION/)
  assert.match(modules.pt, /PORTUGUÊS DO BRASIL/)
  assert.match(modules.es, /COMUNICACIÓN EJECUTIVA/)
  assert.match(modules.pl, /KOMUNIKACJA BIZNESOWA/)
  assert.match(modules.ru, /ДЕЛОВАЯ КОММУНИКАЦИЯ/)

  for (const [locale, block] of Object.entries(modules)) {
    assert.ok(block.length > 350, `${locale} module is unexpectedly thin`)
  }
})

test('translation quality preserves meaning and native professional register in all locales', () => {
  for (const locale of ['en', 'pt', 'es', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar']) {
    const rule = multilingualTranslationQualityRule(locale)
    assert.match(rule, /Supported languages are English, Brazilian Portuguese, Spanish, Polish, Russian, German, French, Italian, Japanese, Korean, and Arabic/)
    assert.match(rule, /Translate meaning and register, not word-for-word syntax/)
    assert.match(rule, /native professional/)
  }
  assert.match(multilingualTranslationQualityRule('de'), /interface language \(German\)/)
  assert.match(multilingualTranslationQualityRule('ja'), /interface language \(Japanese\)/)
  assert.match(multilingualTranslationQualityRule('ar'), /interface language \(Arabic\)/)
})

test('executive reasoning is a silent quality discipline and cannot override governance', () => {
  const framework = executiveReasoningFramework()
  assert.match(framework, /APPLY SILENTLY/)
  assert.match(framework, /goal, constraints, urgency, audience, and desired outcome/)
  assert.match(framework, /impact, feasibility, reversibility/)
  assert.match(framework, /silently self-review/)
  assert.match(framework, /never overrides safety, evidence requirements, approval boundaries, freshness verification, or public\/private data separation/)
})

test('combined executive communication block includes reasoning writing and translation quality', () => {
  const block = executiveCommunicationBlock('pl')
  assert.match(block, /EXECUTIVE REASONING DISCIPLINE/)
  assert.match(block, /KOMUNIKACJA BIZNESOWA/)
  assert.match(block, /MULTILINGUAL QUALITY/)
})

test('direct COS editor is wired to the executive framework and records its use', () => {
  const source = readFileSync(join(process.cwd(), 'lib/ai/cos/directTextTransformation.ts'), 'utf8')
  assert.match(source, /import \{ executiveCommunicationBlock \} from '\.\/executiveCommunication\.ts'/)
  assert.match(source, /executiveCommunicationBlock\(input\.language\)/)
  assert.match(source, /'Executive Communication Framework'/)
  assert.match(source, /REFERENCE CONTEXT is read-only/)
  assert.match(source, /splitQuotedEmailThread\(request\.sourceText\)/)
})
