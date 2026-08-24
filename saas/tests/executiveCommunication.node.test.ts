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

test('executive locale resolution covers all five SignalBoost languages', () => {
  assert.equal(executiveLocale('English'), 'en')
  assert.equal(executiveLocale('pt-BR'), 'pt')
  assert.equal(executiveLocale('Español'), 'es')
  assert.equal(executiveLocale('Polski'), 'pl')
  assert.equal(executiveLocale('Русский'), 'ru')
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
  for (const locale of ['en', 'pt', 'es', 'pl', 'ru']) {
    const rule = multilingualTranslationQualityRule(locale)
    assert.match(rule, /Supported languages are English, Brazilian Portuguese, Spanish, Polish, and Russian/)
    assert.match(rule, /Translate meaning and register, not word-for-word syntax/)
    assert.match(rule, /native professional/)
  }
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
  assert.match(source, /Quoted or forwarded email history is context only/)
})
